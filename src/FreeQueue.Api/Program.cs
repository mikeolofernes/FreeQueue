using FreeQueue.Api.Data;
using FreeQueue.Api.Hubs;
using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using StackExchange.Redis;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// Redis
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis")!));

// Application services
builder.Services.AddScoped<WaitTimeEstimator>();
builder.Services.AddScoped<QueueService>();
builder.Services.AddHttpClient<ISmsService, SmsService>();

// Rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("join", o =>
    {
        o.PermitLimit = 3;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueLimit = 0;
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
    options.AddPolicy("kiosk", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy("auth-login", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(5) }));
});

// JWT Authentication
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret is required in configuration.");

if (!builder.Environment.IsDevelopment() &&
    jwtSecret == "change-this-to-a-long-random-secret-before-deploying-32chars+")
    throw new InvalidOperationException("Default JWT secret must be changed before deploying to production.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "freequeue",
            ValidAudience = "freequeue-staff",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        };
    });

builder.Services.AddAuthorization();

// SignalR
builder.Services.AddSignalR();

// Controllers + Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "QueueFree API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            []
        }
    });
});

// CORS
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var p = policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        if (allowedOrigins.Length > 0)
            p.WithOrigins(allowedOrigins);
        else if (builder.Environment.IsDevelopment())
            p.SetIsOriginAllowed(_ => true);
        else
            throw new InvalidOperationException("Cors:AllowedOrigins must be configured in production. Wildcard CORS is not permitted.");
    });
});

var app = builder.Build();

// Ensure DB schema
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await ctx.Database.EnsureCreatedAsync();

    await ctx.Database.ExecuteSqlRawAsync("""
        UPDATE "QueueTickets" SET "Status" = 'waiting' WHERE "Status" = 'away';
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "Rating" integer;
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS "StaffAccounts" (
            "Id"           SERIAL PRIMARY KEY,
            "BranchId"     VARCHAR(100) NOT NULL,
            "Username"     VARCHAR(100) NOT NULL,
            "PasswordHash" TEXT         NOT NULL,
            "CreatedAt"    TIMESTAMP    NOT NULL DEFAULT NOW(),
            CONSTRAINT "FK_StaffAccounts_Branches_BranchId"
                FOREIGN KEY ("BranchId") REFERENCES "Branches"("Id")
                ON DELETE CASCADE
        );
        ALTER TABLE "Branches" ADD COLUMN IF NOT EXISTS "Category" VARCHAR(50) NULL;
        ALTER TABLE "Branches" ADD COLUMN IF NOT EXISTS "KioskPin" TEXT NULL;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "ViewedAt"  TIMESTAMP NULL;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "ViewToken" VARCHAR(32) NULL;
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        ALTER TABLE "StaffAccounts" DROP CONSTRAINT IF EXISTS "uq_StaffAccounts_BranchId_Username";
        DROP INDEX IF EXISTS "IX_StaffAccounts_BranchId_Username";
        CREATE UNIQUE INDEX IF NOT EXISTS "IX_StaffAccounts_Username"
            ON "StaffAccounts"("Username");

        CREATE TABLE IF NOT EXISTS "BranchServices" (
            "Id"        SERIAL PRIMARY KEY,
            "BranchId"  VARCHAR(100) NOT NULL,
            "Name"      VARCHAR(200) NOT NULL,
            "SortOrder" INTEGER      NOT NULL DEFAULT 0,
            CONSTRAINT "FK_BranchServices_Branches_BranchId"
                FOREIGN KEY ("BranchId") REFERENCES "Branches"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_BranchServices_BranchId" ON "BranchServices"("BranchId");

        ALTER TABLE "StaffAccounts" ADD COLUMN IF NOT EXISTS "Role" VARCHAR(20) NOT NULL DEFAULT 'staff';
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        ALTER TABLE "Branches"     ADD COLUMN IF NOT EXISTS "IsOpen"          BOOLEAN      NOT NULL DEFAULT TRUE;
        ALTER TABLE "Branches"     ADD COLUMN IF NOT EXISTS "Address"         VARCHAR(300) NULL;
        ALTER TABLE "Branches"     ADD COLUMN IF NOT EXISTS "City"            VARCHAR(100) NULL;

        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "Priority"        BOOLEAN      NOT NULL DEFAULT FALSE;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "AbandonedAt"     TIMESTAMP    NULL;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "AbandonPosition" INTEGER      NULL;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "CounterId"       VARCHAR(50)  NULL;

        CREATE TABLE IF NOT EXISTS "Appointments" (
            "Id"           SERIAL PRIMARY KEY,
            "BranchId"     VARCHAR(100)  NOT NULL,
            "ServiceType"  VARCHAR(100)  NOT NULL,
            "CustomerName" VARCHAR(200)  NOT NULL,
            "Phone"        VARCHAR(20)   NULL,
            "ScheduledAt"  TIMESTAMP     NOT NULL,
            "Status"       VARCHAR(20)   NOT NULL DEFAULT 'pending',
            "Notes"        VARCHAR(500)  NULL,
            "CreatedAt"    TIMESTAMP     NOT NULL DEFAULT NOW(),
            CONSTRAINT "FK_Appointments_Branches_BranchId"
                FOREIGN KEY ("BranchId") REFERENCES "Branches"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_Appointments_BranchId_ScheduledAt"
            ON "Appointments"("BranchId", "ScheduledAt");
        """);

    // Scope ticket-number uniqueness by queue date. Ticket numbers reset daily
    // (the Redis counter is keyed by date), so the global unique index on
    // (BranchId, TicketNumber) collided with prior days' tickets. Add a
    // QueueDate column; the actual unique index (scoped per service group) is
    // created further below, since a single global index here would collide
    // with grouped tickets that legitimately reuse a TicketNumber also used
    // by an ungrouped ticket on the same day.
    await ctx.Database.ExecuteSqlRawAsync("""
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "QueueDate" DATE;
        UPDATE "QueueTickets" SET "QueueDate" = "JoinedAt"::date WHERE "QueueDate" IS NULL;
        ALTER TABLE "QueueTickets" ALTER COLUMN "QueueDate" SET DEFAULT CURRENT_DATE;
        ALTER TABLE "QueueTickets" ALTER COLUMN "QueueDate" SET NOT NULL;

        DROP INDEX IF EXISTS "IX_QueueTickets_BranchId_TicketNumber";
        DROP INDEX IF EXISTS "IX_QueueTickets_BranchId_QueueDate_TicketNumber";
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        ALTER TABLE "StaffAccounts" ADD COLUMN IF NOT EXISTS "DefaultKioskPin" TEXT NULL;
        """);

    await ctx.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS "ServiceGroups" (
            "Id"        SERIAL       PRIMARY KEY,
            "BranchId"  VARCHAR(100) NOT NULL,
            "Name"      VARCHAR(200) NOT NULL,
            "Prefix"    VARCHAR(5)   NULL,
            "SortOrder" INTEGER      NOT NULL DEFAULT 0,
            "CreatedAt" TIMESTAMP    NOT NULL DEFAULT NOW(),
            CONSTRAINT "FK_ServiceGroups_Branches_BranchId"
                FOREIGN KEY ("BranchId") REFERENCES "Branches"("Id") ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "IX_ServiceGroups_BranchId" ON "ServiceGroups"("BranchId");

        ALTER TABLE "BranchServices"
            ADD COLUMN IF NOT EXISTS "ServiceGroupId" INTEGER NULL
            REFERENCES "ServiceGroups"("Id") ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS "IX_BranchServices_ServiceGroupId"
            ON "BranchServices"("ServiceGroupId");

        ALTER TABLE "QueueTickets"
            ADD COLUMN IF NOT EXISTS "ServiceGroupId" INTEGER NULL
            REFERENCES "ServiceGroups"("Id") ON DELETE SET NULL;
        ALTER TABLE "QueueTickets"
            ADD COLUMN IF NOT EXISTS "DisplayNumber" VARCHAR(20) NULL;

        UPDATE "QueueTickets"
            SET "DisplayNumber" = "TicketNumber"::text
            WHERE "DisplayNumber" IS NULL;

        DROP INDEX IF EXISTS "IX_QueueTickets_BranchId_QueueDate_TicketNumber";

        CREATE UNIQUE INDEX IF NOT EXISTS "IX_QueueTickets_Ungrouped_Unique"
            ON "QueueTickets"("BranchId", "QueueDate", "TicketNumber")
            WHERE "ServiceGroupId" IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS "IX_QueueTickets_Grouped_Unique"
            ON "QueueTickets"("BranchId", "ServiceGroupId", "QueueDate", "TicketNumber")
            WHERE "ServiceGroupId" IS NOT NULL;
        """);
}

// Middleware pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "QueueFree API v1"));
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<QueueHub>("/hubs/queue");
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Run();

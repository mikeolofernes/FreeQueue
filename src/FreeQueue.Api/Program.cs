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

// ── Database ──────────────────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// ── Redis ─────────────────────────────────────────────────────────────────────
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(builder.Configuration.GetConnectionString("Redis")!));

// ── Application services ──────────────────────────────────────────────────────
builder.Services.AddScoped<WaitTimeEstimator>();
builder.Services.AddScoped<QueueService>();
builder.Services.AddHttpClient<SmsService>();
builder.Services.AddSingleton<ISmsService, SmsService>();

// ── Rate limiting ─────────────────────────────────────────────────────────────
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
});

// ── JWT Authentication ────────────────────────────────────────────────────────
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret is required in configuration.");

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


// ── SignalR ───────────────────────────────────────────────────────────────────
builder.Services.AddSignalR();

// ── Controllers + Swagger ─────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "QueueFree API", Version = "v1" });
    // Allow pasting a JWT in Swagger UI
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

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production set CORS__ALLOWEDORIGINS__0 / __1 etc. as Railway env vars.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var p = policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        if (allowedOrigins.Length > 0)
            p.WithOrigins(allowedOrigins);
        else
            p.SetIsOriginAllowed(_ => true); // dev fallback — no origins configured
    });
});

var app = builder.Build();

// ── Ensure DB schema ──────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // EnsureCreated only runs on a brand-new database. For existing databases
    // we run idempotent ALTER scripts so new tables/columns are always present.
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
            CONSTRAINT "uq_StaffAccounts_BranchId_Username"
                UNIQUE ("BranchId", "Username"),
            CONSTRAINT "FK_StaffAccounts_Branches_BranchId"
                FOREIGN KEY ("BranchId") REFERENCES "Branches"("Id")
                ON DELETE CASCADE
        );
        ALTER TABLE "Branches" ADD COLUMN IF NOT EXISTS "Category" VARCHAR(50) NULL;
        ALTER TABLE "Branches" ADD COLUMN IF NOT EXISTS "KioskPin" TEXT NULL;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "ViewedAt" TIMESTAMP NULL;
        ALTER TABLE "QueueTickets" ADD COLUMN IF NOT EXISTS "ViewToken" VARCHAR(32) NULL;
        """);
}

// ── Middleware pipeline ───────────────────────────────────────────────────────
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

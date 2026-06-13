using FreeQueue.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<QueueTicket> QueueTickets => Set<QueueTicket>();
    public DbSet<QueueTransaction> QueueTransactions => Set<QueueTransaction>();
    public DbSet<StaffAccount> StaffAccounts => Set<StaffAccount>();
    public DbSet<BranchService> BranchServices => Set<BranchService>();
    public DbSet<Appointment> Appointments => Set<Appointment>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Branch>(e =>
        {
            e.HasKey(b => b.Id);
            e.Property(b => b.Id).HasMaxLength(100);
            e.Property(b => b.Name).HasMaxLength(200).IsRequired();
            e.Property(b => b.MaxCapacity).HasDefaultValue(50);
            e.Property(b => b.GraceMinutes).HasDefaultValue(15);
            e.Property(b => b.IsOpen).HasDefaultValue(true);
            e.HasMany(b => b.Tickets).WithOne(t => t.Branch).HasForeignKey(t => t.BranchId);
            e.HasMany(b => b.Transactions).WithOne(t => t.Branch).HasForeignKey(t => t.BranchId);
        });

        mb.Entity<QueueTicket>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.ServiceType).HasMaxLength(100).IsRequired();
            e.Property(t => t.CustomerName).HasMaxLength(200);
            e.Property(t => t.Phone).HasMaxLength(20);
            e.Property(t => t.Status).HasMaxLength(20).HasDefaultValue("waiting");
            e.Property(t => t.Priority).HasDefaultValue(false);
            e.Property(t => t.CounterId).HasMaxLength(50);
            e.HasIndex(t => new { t.BranchId, t.QueueDate, t.TicketNumber }).IsUnique();
            e.HasIndex(t => new { t.BranchId, t.Status });
        });

        mb.Entity<QueueTransaction>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.ServiceType).HasMaxLength(100).IsRequired();
            e.HasIndex(t => new { t.BranchId, t.ServiceType, t.HourOfDay });
        });

        mb.Entity<StaffAccount>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Username).HasMaxLength(100).IsRequired();
            e.Property(a => a.PasswordHash).IsRequired();
            e.Property(a => a.Role).HasMaxLength(20).HasDefaultValue("staff").IsRequired();
            e.HasIndex(a => a.Username).IsUnique();
            e.HasOne(a => a.Branch).WithMany().HasForeignKey(a => a.BranchId);
        });

        mb.Entity<BranchService>(e =>
        {
            e.HasKey(s => s.Id);
            e.Property(s => s.Name).HasMaxLength(200).IsRequired();
            e.HasOne(s => s.Branch).WithMany(b => b.Services).HasForeignKey(s => s.BranchId);
            e.HasIndex(s => s.BranchId);
        });

        mb.Entity<Appointment>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.ServiceType).HasMaxLength(100).IsRequired();
            e.Property(a => a.CustomerName).HasMaxLength(200).IsRequired();
            e.Property(a => a.Phone).HasMaxLength(20);
            e.Property(a => a.Status).HasMaxLength(20).HasDefaultValue("pending");
            e.Property(a => a.Notes).HasMaxLength(500);
            e.HasOne(a => a.Branch).WithMany().HasForeignKey(a => a.BranchId);
            e.HasIndex(a => new { a.BranchId, a.ScheduledAt });
        });
    }
}

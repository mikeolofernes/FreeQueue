using FreeQueue.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<QueueTicket> QueueTickets => Set<QueueTicket>();
    public DbSet<QueueTransaction> QueueTransactions => Set<QueueTransaction>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Branch>(e =>
        {
            e.HasKey(b => b.Id);
            e.Property(b => b.Id).HasMaxLength(100);
            e.Property(b => b.Name).HasMaxLength(200).IsRequired();
            e.Property(b => b.MaxCapacity).HasDefaultValue(50);
            e.Property(b => b.GraceMinutes).HasDefaultValue(15);
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
            e.HasIndex(t => new { t.BranchId, t.TicketNumber }).IsUnique();
            e.HasIndex(t => new { t.BranchId, t.Status });
        });

        mb.Entity<QueueTransaction>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.ServiceType).HasMaxLength(100).IsRequired();
            e.HasIndex(t => new { t.BranchId, t.ServiceType, t.HourOfDay });
        });
    }
}

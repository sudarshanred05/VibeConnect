const cron = require("node-cron");
const User = require("../models/User");
const { sendAdminReminder } = require("./email");

const startReminderCron = () => {
  // Run every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      const fortyEightHoursAgo = new Date(Date.now() - 46 * 60 * 60 * 1000);

      const pendingUsers = await User.find({
        status: "pending",
        reminderSent: false,
        createdAt: { $lte: fortyEightHoursAgo },
      });

      if (pendingUsers.length > 0) {
        console.log(
          `⏰ Found ${pendingUsers.length} pending users > 46 hours. Sending reminder...`,
        );

        await sendAdminReminder(pendingUsers);

        await User.updateMany(
          { _id: { $in: pendingUsers.map((u) => u._id) } },
          { reminderSent: true },
        );

        console.log("✉️  Reminder sent to admin");
      }
    } catch (error) {
      console.error("❌ Reminder cron error:", error.message);
    }
  });

  console.log("⏰ Reminder cron started (runs every 30 minutes)");
};

module.exports = startReminderCron;

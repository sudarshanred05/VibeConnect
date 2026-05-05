const User = require("../models/User");

const createDefaultAdmin = async () => {
  try {
    const adminExists = await User.findOne({ email: "admin@gmail.com" });

    if (!adminExists) {
      await User.create({
        name: "System Administrator",
        email: "admin@gmail.com",
        password: "Admin123",
        role: "admin",
        status: "approved",
        designation: "Admin",
        approvedAt: new Date(),
      });
      console.log("✅ Default admin created (admin@gmail.com / Admin123)");
    } else {
      if (adminExists.designation !== "Admin") {
        adminExists.designation = "Admin";
        adminExists.role = "admin";
        adminExists.status = "approved";
        await adminExists.save();
        console.log("🔁 Default admin migrated to new designation model");
      }
      console.log("ℹ️  Admin already exists");
    }
  } catch (error) {
    console.error("❌ Error creating default admin:", error.message);
  }
};

module.exports = createDefaultAdmin;

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ROLES = ["admin", "employee", "manager", "hr"];
const STATUSES = ["pending", "approved", "rejected"];
const DESIGNATIONS = [
  "Intern",
  "SDE1",
  "SDE2",
  "Senior Engineer",
  "Lead Engineer",
  "Manager",
  "Senior Manager",
  "Director",
  "HR",
  "Admin",
];

const DESIGNATION_LEVELS = DESIGNATIONS.reduce((acc, key, idx) => {
  acc[key] = idx + 1;
  return acc;
}, {});

const DESIGNATION_TO_ROLE = {
  Admin: "admin",
  HR: "hr",
  Manager: "manager",
  "Senior Manager": "manager",
  Director: "manager",
};

const LEGACY_DESIGNATION_ALIASES = {
  "System Administrator": "Admin",
};
const MODULES = [
  "Time Management",
  "Payroll",
  "HR",
  "Recruitment",
  "Finance",
  "Performance",
  "Admin",
  "Employees"
];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    password: {
      type: String,
      select: false,
    },
    designation: {
      type: String,
      enum: DESIGNATIONS,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ROLES,
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "pending",
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    module: {
      type: String,
      enum: MODULES,
      default: null,
    },
    refreshToken: {
      type: String,
      select: false,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    socketId: {
      type: String,
      default: null,
    },
    pushSubscription: {
      type: Object,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

userSchema.virtual("initials").get(function () {
  return this.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.pre("validate", function (next) {
  if (typeof this.designation === "string") {
    const normalized = LEGACY_DESIGNATION_ALIASES[this.designation];
    if (normalized) {
      this.designation = normalized;
    }
  }

  if (!this.designation && this.role === "admin") {
    this.designation = "Admin";
  } else if (!this.designation && this.role === "hr") {
    this.designation = "HR";
  } else if (!this.designation && this.role === "manager") {
    this.designation = "Manager";
  } else if (!this.designation && this.status === "approved") {
    this.designation = "SDE1";
  }

  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ role: 1 });
userSchema.index({ module: 1 });
userSchema.index({ isOnline: 1, lastSeen: -1 });

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
module.exports.STATUSES = STATUSES;
module.exports.MODULES = MODULES;
module.exports.DESIGNATIONS = DESIGNATIONS;
module.exports.DESIGNATION_LEVELS = DESIGNATION_LEVELS;
module.exports.DESIGNATION_TO_ROLE = DESIGNATION_TO_ROLE;

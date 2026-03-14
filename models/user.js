const mongoose = require('mongoose');




const userSchema = new mongoose.Schema({
  firstName:String,
  lastName:String,
  email:String,
  password:String,
  otp: String,           
    otpExpires: Date,      
    isVerified: { type: Boolean, default: false }
});

module.exports = mongoose.model("user", userSchema);
const mongoose = require('mongoose');

mongoose.connect("mongodb://127.0.0.1:27017/notes");


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
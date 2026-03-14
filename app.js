const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const userModel = require('./models/user');
const noteModel = require('./models/note');

const app = express();
mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("MongoDB Connected"))
.catch(err => console.log(err));

// --- MIDDLEWARES ---
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// --- NODEMAILER CONFIG ---
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
});

// --- CUSTOM MIDDLEWARE ---
function isLoggedIn(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login');

    try {
        const data = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
        req.user = data;
        next();
    } catch (err) {
        res.clearCookie('token');
        res.redirect('/login');
    }
}

// --- AUTH ROUTES ---

app.get('/', (req, res) => {
    // Dummy data for testing
    const notes = [
        { id: 1, title: 'Project Ideas', body: 'Build a notes app with EJS and Node.js', createdAt: new Date() },
        { id: 2, title: 'Grocery List', body: 'Eggs, Milk, Bread, Coffee', createdAt: new Date() }
    ];
    
    res.render('home', { notes: notes });
});

app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    try {
        let { firstName, lastName, email, password } = req.body;

        // Password Validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.send('Password must be 8+ chars with uppercase, lowercase, number and symbol.');
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

        await userModel.create({
            firstName, lastName, email,
            password: hash,
            otp: generatedOtp,
            otpExpires: Date.now() + 10 * 60 * 1000
        });

        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: email,
            subject: 'Verification Code',
            text: `Your OTP is ${generatedOtp}`
        });

        res.render('verify-otp', { email });
    } catch (err) {
        res.send("Registration Error: Email might already exist.");
    }
});

app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    const user = await userModel.findOne({ email });

    if (user && user.otp === otp && user.otpExpires > Date.now()) {
        user.isVerified = true;
        user.otp = null;
        user.otpExpires = null;
        await user.save();
        res.redirect('/login');
    } else {
        res.send("Invalid or Expired OTP");
    }
});

app.post('/resend-otp', async (req, res) => {
    const { email } = req.body;
    const user = await userModel.findOne({ email });
    if (!user) return res.send("User not found");

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = newOtp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'New OTP Code',
        text: `Your new OTP is ${newOtp}`
    });
    res.render('verify-otp', { email });
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    let { email, password } = req.body;
    let user = await userModel.findOne({ email });

    if (!user) return res.send("User not found");
    if (!user.isVerified) return res.send("Please verify your email first.");

    const result = await bcrypt.compare(password, user.password);
    if (result) {
        const token = jwt.sign({ email: user.email, userid: user._id }, process.env.JWT_SECRET || 'secretkey');
        res.cookie('token', token, { httpOnly: true, path: '/' });
        res.redirect('/notes');
    } else {
        res.send("Wrong password");
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

// --- NOTES ROUTES (CRUD) ---

app.get('/notes', isLoggedIn, async (req, res) => {
    const notes = await noteModel.find({ user: req.user.userid });
    res.render('notes', { notes });
});

app.get('/create-note', isLoggedIn, (req, res) => res.render('create-note'));

app.post('/create-note', isLoggedIn, async (req, res) => {
    const { title, content } = req.body;
    await noteModel.create({ title, content, user: req.user.userid });
    res.redirect('/notes');
});

// Edit Route (GET) - This fixes your "Cannot GET /edit" error
app.get('/edit/:id', isLoggedIn, async (req, res) => {
    const note = await noteModel.findById(req.params.id);
    res.render('edit', { note });
});

app.post('/update/:id', isLoggedIn, async (req, res) => {
    const { title, content } = req.body;
    await noteModel.findOneAndUpdate({ _id: req.params.id, user: req.user.userid }, { title, content });
    res.redirect('/notes');
});

app.post('/delete/:id', isLoggedIn, async (req, res) => {
    await noteModel.findByIdAndDelete(req.params.id);
    res.redirect('/notes');
});

// --- PASSWORD RESET ROUTES ---

app.get('/forgot-password', (req, res) => res.render('forgot-password'));

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await userModel.findOne({ email });
    if (!user) return res.send("User not found");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Password Reset OTP',
        text: `OTP to reset password: ${otp}`
    });
    res.render('reset-password', { email });
});

app.post('/reset', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const user = await userModel.findOne({ email });

    if (user && user.otp === otp && user.otpExpires > Date.now()) {
        user.password = await bcrypt.hash(newPassword, 10);
        user.otp = null;
        user.otpExpires = null;
        await user.save();
        res.send("Password reset success! <a href='/login'>Login here</a>");
    } else {
        res.send("Invalid or Expired OTP.");
    }
});


module.exports = app;
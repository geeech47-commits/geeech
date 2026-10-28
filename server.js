// Add these lines at the VERY TOP of your server.js
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']); // Uses Cloudflare and Google DNS

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();
const session = require('express-session');
const MongoStore = require('connect-mongo').default;

// Set body parser limits to handle custom basket image string payloads safely
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(session({
    secret: '70061498279682371735iffa',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        // FIXED: Removed the invalid angle brackets  from the connection string username/password wrapper
        mongoUrl: "mongodb+srv://geeechadmin:geeechadmin%407006@cluster1.ffjxfnu.mongodb.net/geeech"
    }),
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true 
    }
}));

// 2. Serve Static Files
app.use(express.static(path.join(__dirname, "public")));

// Direct visitors to the staff sign-in page before they can access the dashboard.
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Render runs on Linux, where filename case matters. Keep the billing URL
// lowercase so navigation to /createbill.html works consistently everywhere.
app.get('/createbill.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Createbill.html'));
});

// 2. Staff URL to access the POS Login system
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(cors({
    origin: true,
    credentials: true
}));

// Standard Connection String (Fixed: removed angle brackets from password wrapper which caused the EBADNAME querySrv crash)
const mongoURI = "mongodb+srv://geeechadmin:geeechadmin%407006@cluster1.ffjxfnu.mongodb.net/geeech";

mongoose.connect(mongoURI, { 
    family: 4 
})
.then(() => console.log("Connected to MongoDB Atlas: Fruitz"))
.catch(err => {
    console.error("MongoDB Connection Error:", err);
    console.log("TIP: If this fails, try changing your DNS to Google (8.8.8.8) or Cloudflare (1.1.1.1)");
});

// --- SCHEMAS ---
const BasketItemSchema = new mongoose.Schema({
    tier: { 
        type: String, 
        required: true, 
    },
    name: { 
        type: String, 
        required: true 
    }, 
    description: { 
        type: String, 
        required: true 
    }, 
    price: { 
        type: String, 
        required: true 
    }, 
    image: { 
        type: String, 
        default: "" 
    } 
});

const BasketItem = mongoose.model('BasketItem', BasketItemSchema);

const BillSchema = new mongoose.Schema({
    id: String,
    date: { type: Date, default: Date.now },
    orderType: { 
        type: String, 
        default: 'dine-in' 
    },
    customer: String,
    phone: String,
    address: String,
    subtotal: Number,
    discount: Number,
    advance: Number,
    saleTotal: Number,
    paymentMode: { type: String, default: 'unrecorded' },
    paymentBreakdown: { type: Array, default: [] },
    paymentStatus: {
        type: String,
        enum: ['paid', 'unpaid'],
        default: 'paid'
    },
    deliveryDate: String,
    deliveryTime: String,
    items: Array,
    total: Number,
    balance: Number,
    packagedOn: {
        type: String, 
        default: ""
    },
    orderStatus: {
        type: String,
        default: 'active'
    },
    Status: {
        type: String,
        default: 'active'
    },
    cancellationNote: {
        type: String,
        default: ''
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: '' },
    packagedTime: {
        type: String, 
        default: ""
    }, 
    orderSource: { 
        type: String, 
        default: 'offline' 
    },
    riderAssigned: {
    type: String,
    default: ""
},
riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Rider",
    default: null
},
riderCode: {
    type: String,
    default: ""
},
riderAssignedAt: {
    type: Date,
    default: null
},
}, { timestamps: true }); 

const RiderSchema = new mongoose.Schema({
    // Human-facing identifier. This is intentionally separate from MongoDB's _id.
    riderCode: {
        type: String,
        unique: true,
        sparse: true,
        immutable: true
    },
    riderName: { 
        type: String, 
        required: true 
    },
    riderMobile: { 
        type: String, 
        required: true 
    },
    riderVehicle: { 
        type: String, 
        required: true 
    },
    riderAddress: { 
        type: String, 
        required: true 
    },
    riderPhoto: { 
        type: String, 
        default: "" 
    },
    status: { 
        type: String, 
        default: 'active' // Automatically sets status to active on creation
    }
}, { timestamps: true });

const RiderSequenceSchema = new mongoose.Schema({
    _id: String,
    sequence: { type: Number, default: 0 }
});

BillSchema.index({ date: -1 });
BillSchema.index({ id: 1 });
BillSchema.index({ phone: 1, date: -1 });
RiderSchema.index({ status: 1, createdAt: -1 });
const Rider = mongoose.model('Rider', RiderSchema);
const RiderSequence = mongoose.model('RiderSequence', RiderSequenceSchema);
const Bill = mongoose.model('Bill', BillSchema);

async function getNextRiderCode() {
    const sequence = await RiderSequence.findByIdAndUpdate(
        'riderCode',
        { $inc: { sequence: 1 } },
        { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
    return `GH${String(sequence.sequence).padStart(4, '0')}`;
}

async function backfillLegacyRiderCodes() {
    const legacyRiders = await Rider.find({
        $or: [
            { riderCode: { $exists: false } },
            { riderCode: null },
            { riderCode: '' }
        ]
    }).select('_id').lean();

    for (const rider of legacyRiders) {
        const riderCode = await getNextRiderCode();
        await Rider.updateOne(
            { _id: rider._id, $or: [{ riderCode: { $exists: false } }, { riderCode: null }, { riderCode: '' }] },
            { $set: { riderCode } }
        );
    }
}

const HistorySchema = new mongoose.Schema({
    bill_id: String,
    edit_date: String,
    change_log: String
});
const History = mongoose.model('History', HistorySchema);

const MenuSchema = new mongoose.Schema({
    name: String,
    price: Number,
    category: String
});
const Menu = mongoose.model('Menu', MenuSchema);

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: { type: String, default: 'user' }
});

const User = mongoose.model('User', UserSchema); 

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next(); 
    } else {
        res.status(401).json({ error: "Unauthorized. Please login." });
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Unauthorized. Please login.' });
        }
        const user = await User.findOne({ username: req.session.user }).select('username role').lean();
        const isAdmin = String(user?.role || '').toLowerCase() === 'admin' || String(user?.username || '').toLowerCase() === 'admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Access denied, contact administration.' });
        }
        req.currentUser = user;
        return next();
    } catch (error) {
        console.error('Could not verify admin access:', error);
        return res.status(500).json({ error: 'Could not verify admin access.' });
    }
};

// ROUTES
app.get('/api/current-user', async (req, res) => {
    if (req.session && req.session.user) {
        const user = await User.findOne({ username: req.session.user });

        res.json({
            username: user.username,
            role: user.role
        });
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find(); 
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch staff" });
    }
});

app.post('/api/users/add', isAuthenticated, async (req, res) => {
    try {
        const currentUser = await User.findOne({ username: req.session.user });

        if (!currentUser || currentUser.role !== 'admin') {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }

        const { username, password, role } = req.body;

        const newUser = new User({ username, password, role });
        await newUser.save();

        res.status(200).json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.delete('/api/users/:username', async (req, res) => {
    try {
        const usernameToDelete = req.params.username;
        const user = await User.findOne({ username: usernameToDelete });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.role === 'admin' || user.username.toLowerCase() === 'admin') {
            return res.status(403).json({ error: "Access Denied: Cannot delete Admin accounts." });
        }

        await User.findOneAndDelete({ username: usernameToDelete });
        res.json({ success: true, message: "Member deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete member" });
    }
});

app.get('/api/next-bill-id', async (req, res) => {
    try {
        const lastBill = await Bill.findOne().sort({ _id: -1 }).select('id').lean();
        
        let count = 1;
        if (lastBill?.id) {
            const parts = lastBill.id.split('-');
            count = parseInt(parts[2]) + 1;
        }

        const d = new Date();
        const dateStr = `${d.getFullYear().toString().slice(-2)}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}`;
        const newId = `FR-${dateStr}-${count.toString().padStart(3,'0')}`;

        res.json({ billId: newId });

    } catch (err) {
        console.error("Error generating ID:", err);
        res.status(500).json({ error: "Could not generate ID" });
    }
});

app.get('/api/bills', async (req, res) => {
    try {
        const isSummary = req.query.summary === '1';
        const query = Bill.find({ isDeleted: { $ne: true } }).sort({ date: -1 }).lean();
        if (isSummary) {
            // List views need payment and delivery metadata, but item arrays and unrelated fields
            // make the all-bills response unnecessarily large.
            query.select('id date orderType customer phone address subtotal discount advance saleTotal paymentMode paymentBreakdown paymentStatus deliveryDate deliveryTime total balance orderSource Status status orderStatus packagedOn packagedTime riderAssigned riderCode riderAssignedAt riderId cancellationNote createdAt updatedAt');
        } else {
            query.populate('riderId', 'riderName riderCode riderMobile');
        }
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        if (Number.isFinite(requestedLimit) && requestedLimit > 0) query.limit(Math.min(requestedLimit, 500));
        const bills = await query;
        res.json(bills);
    } catch (err) { res.status(500).send(err); }
});

app.get('/api/bills/:id', async (req, res) => {
    try {
        const billId = req.params.id;
        const bill = await Bill.findOne({ isDeleted: { $ne: true }, $or: [{ id: billId }, { invoiceNo: billId }] }).lean(); 
        
        if (!bill) {
            return res.status(404).json({ message: "Bill not found" });
        }
        
        res.json(bill);
    } catch (err) {
        console.error("Database Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bills', async (req, res) => {
    try {
        const data = req.body;
        const requestedTotal = Number.parseFloat(data.total) || 0;
        const requestedAdvance = Math.max(0, Number.parseFloat(data.advance) || 0);
        const subtotal = Number.parseFloat(data.subtotal);
        const discount = Number.parseFloat(data.discount) || 0;
        const saleTotal = Number.isFinite(subtotal)
            ? Math.max(0, subtotal - discount)
            : Math.max(0, requestedTotal + requestedAdvance);
        let paymentMode = String(data.paymentMode || data.payMethod || (data.orderSource === 'ONLINE' ? 'upi' : 'unrecorded')).toLowerCase();
        if (paymentMode === 'online') paymentMode = 'upi';
        let paymentBreakdown = Array.isArray(data.paymentBreakdown)
            ? data.paymentBreakdown.map(payment => ({ mode: String(payment.mode || '').toLowerCase(), amount: Math.max(0, Number(payment.amount) || 0) })).map(payment => payment.mode === 'online' ? { ...payment, mode: 'upi' } : payment).filter(payment => ['cash', 'upi', 'debitcard'].includes(payment.mode) && payment.amount > 0)
            : [];
        if (!['cash', 'upi', 'debitcard', 'split', 'unpaid', 'unrecorded'].includes(paymentMode)) paymentMode = 'unrecorded';
        let advance = data.orderSource === 'ONLINE' ? saleTotal : Math.min(saleTotal, requestedAdvance);
        if (paymentMode === 'unpaid') {
            advance = 0;
            paymentBreakdown = [];
        } else if (paymentMode === 'split') {
            const splitTotal = paymentBreakdown.reduce((sum, payment) => sum + payment.amount, 0);
            if (Math.abs(splitTotal - saleTotal) > 0.01) {
                return res.status(400).json({ error: 'Split payment amounts must equal the bill total.' });
            }
            advance = saleTotal;
            let remaining = advance;
            paymentBreakdown = paymentBreakdown.map(payment => {
                const amount = Math.min(payment.amount, remaining);
                remaining -= amount;
                return { ...payment, amount };
            }).filter(payment => payment.amount > 0);
        } else {
            advance = saleTotal;
            paymentBreakdown = ['cash', 'upi', 'debitcard'].includes(paymentMode)
                ? [{ mode: paymentMode, amount: saleTotal }]
                : [];
        }
        const balance = Math.max(0, saleTotal - advance);
        const paymentStatus = paymentMode === 'unpaid' ? 'unpaid' : 'paid';
      // Determine order status based on order type
        let initialStatus = 'complete'; // Default for dine-in
        const orderType = data.orderType || 'indine'; // <-- Bug: mismatch with 'dine-in'

        if (orderType === 'takeaway') {
            initialStatus = 'takeaway pending';
        } else if (orderType === 'deliver') {
            initialStatus = 'delivery pending';
        }
        const newBill = new Bill({
            ...data,
            orderType: data.orderType || 'dine-in', 
            Status: initialStatus, // <-- Only updating 'Status', leaving 'orderStatus' default
            advance: advance,
            paymentMode,
            paymentBreakdown,
            saleTotal,
            paymentStatus,
            total: balance,
            balance
        });
        
        await newBill.save();
        res.json({ success: true, billId: newBill.id, paymentStatus, saleTotal, balance, paymentMode, paymentBreakdown });
    } catch (err) { 
        res.status(500).send(err); 
    }
});

app.patch('/api/bills/:id/payment', async (req, res) => {
    try {
        const requestedStatus = String(req.body.paymentStatus || '').toLowerCase();
        if (!['paid', 'unpaid'].includes(requestedStatus)) {
            return res.status(400).json({ error: 'Payment status must be paid or unpaid.' });
        }

        const bill = await Bill.findOne({ id: req.params.id, isDeleted: { $ne: true } });
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });

        const storedSaleTotal = Number(bill.saleTotal);
        const subtotal = Number(bill.subtotal);
        const discount = Number(bill.discount) || 0;
        const saleTotal = Number.isFinite(storedSaleTotal)
            ? storedSaleTotal
            : Number.isFinite(subtotal)
                ? Math.max(0, subtotal - discount)
                : Math.max(0, Number(bill.total || 0) + Number(bill.advance || 0));
        const advance = requestedStatus === 'paid' ? saleTotal : 0;
        const balance = Math.max(0, saleTotal - advance);

        const existingPayments = Array.isArray(bill.paymentBreakdown) ? bill.paymentBreakdown : [];
        let paymentMode = String(req.body.paymentMode || bill.paymentMode || (bill.orderSource === 'ONLINE' ? 'upi' : bill.payMethod || 'cash')).toLowerCase();
        if (paymentMode === 'online') paymentMode = 'upi';
        let paymentBreakdown = [];
        if (advance > 0) {
            if (paymentMode === 'split' && existingPayments.length) {
                const oldTotal = existingPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0) || 1;
                let allocated = 0;
                paymentBreakdown = existingPayments.map((payment, index) => {
                    const amount = index === existingPayments.length - 1
                        ? advance - allocated
                        : Math.round(advance * (Math.max(0, Number(payment.amount) || 0) / oldTotal) * 100) / 100;
                    allocated += amount;
                    return { mode: payment.mode, amount };
                });
            } else {
                if (!['cash', 'upi', 'debitcard'].includes(paymentMode)) paymentMode = 'cash';
                paymentBreakdown = [{ mode: paymentMode, amount: advance }];
            }
        } else {
            if (!['cash', 'upi', 'debitcard', 'split'].includes(paymentMode)) paymentMode = 'unpaid';
        }

        bill.saleTotal = saleTotal;
        bill.advance = advance;
        bill.paymentMode = paymentMode;
        bill.paymentBreakdown = paymentBreakdown;
        bill.total = balance;
        bill.balance = balance;
        bill.paymentStatus = requestedStatus;
        await bill.save();

        await new History({
            bill_id: bill.id,
            edit_date: new Date().toLocaleString(),
            change_log: `Payment status changed to ${requestedStatus.toUpperCase()}`
        }).save();

        res.json({ success: true, paymentStatus: requestedStatus, saleTotal, balance, paymentMode, paymentBreakdown });
    } catch (err) {
        console.error('Failed to update bill payment status:', err);
        res.status(500).json({ error: 'Failed to update payment status.' });
    }
});

app.patch('/api/bills/:id/payment-mode', async (req, res) => {
    try {
        let paymentMode = String(req.body.paymentMode || '').toLowerCase();
        if (paymentMode === 'online') paymentMode = 'upi';
        if (!['cash', 'upi', 'debitcard'].includes(paymentMode)) {
            return res.status(400).json({ error: 'Choose cash, UPI, or debit card.' });
        }

        const bill = await Bill.findOne({ id: req.params.id, isDeleted: { $ne: true } });
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });

        const received = Math.max(0, Number(bill.advance) || 0);
        const previousMode = String(bill.paymentMode || '').toLowerCase();
        bill.paymentMode = paymentMode;
        bill.paymentBreakdown = received > 0 ? [{ mode: paymentMode, amount: received }] : [];
        await bill.save();

        await new History({
            bill_id: bill.id,
            edit_date: new Date().toLocaleString(),
            change_log: `Payment mode changed from ${(previousMode || 'unrecorded').toUpperCase()} to ${paymentMode.toUpperCase()}`
        }).save();

        res.json({ success: true, paymentMode, paymentBreakdown: bill.paymentBreakdown });
    } catch (err) {
        console.error('Failed to update bill payment mode:', err);
        res.status(500).json({ error: 'Failed to update payment mode.' });
    }
});

// Example Express Backend Route for Updating Order Status
app.patch('/api/bills/:id/status', async (req, res) => {
    try {
        const billId = req.params.id;
        const { status, riderAssigned, riderId, riderCode } = req.body;
        if (!status) {
            return res.status(400).json({ error: "A status is required" });
        }

        const updateData = { Status: status };
        if (status === 'out for delivery') {
            if (!riderAssigned || !mongoose.isValidObjectId(riderId)) {
                return res.status(400).json({ error: "A valid rider is required for delivery assignment" });
            }
            updateData.riderAssigned = riderAssigned;
            updateData.riderId = riderId;
            updateData.riderCode = riderCode || "";
            updateData.riderAssignedAt = new Date();
        }

        // Example using MongoDB / Mongoose:
        const updatedBill = await Bill.findOneAndUpdate(
            { isDeleted: { $ne: true }, $or: [{ id: billId }, { invoiceNo: billId }] },
            { 
                $set: updateData
            },
            { returnDocument: 'after' }
        );

        if (!updatedBill) {
            return res.status(404).json({ error: "Bill not found" });
        }

        res.json({ success: true, updatedBill });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error updating bill status" });
    }
});
app.patch('/api/bills/:id/packaging', async (req, res) => {
    try {
        const billId = req.params.id; 
        const { packagedOn, packagedTime } = req.body;

        const updatedBill = await Bill.findOneAndUpdate(
            { id: billId, isDeleted: { $ne: true } },
            { 
                $set: { 
                    packagedOn: packagedOn, 
                    packagedTime: packagedTime 
                } 
            },
            { returnDocument: 'after' } 
        );

        if (!updatedBill) {
            return res.status(404).json({ error: "Bill transactional profile not found" });
        }

        const logEntry = `Sticky Tag printed: Package compiled on ${packagedOn} at ${packagedTime}`;
        const newHistory = new History({
            bill_id: billId,
            edit_date: new Date().toLocaleString(),
            change_log: logEntry
        });
        await newHistory.save();

        res.status(200).json({ success: true, message: "Packaging sync coordinates saved onto Cloud DB Cluster." });
    } catch (err) {
        console.error("Failed to commit packaging timestamp updates:", err);
        res.status(500).json({ error: "Cloud database updates rejected." });
    }
});
// Route to add a new delivery rider profile
app.post('/api/riders', isAuthenticated, async (req, res) => {
    try {
        const { riderName, riderMobile, riderVehicle, riderAddress, riderPhoto } = req.body;

        // Generate a stable business ID (GH0001, GH0002, ...) independently of MongoDB's _id.
        const riderCode = await getNextRiderCode();

        const newRider = new Rider({
            riderCode,
            riderName,
            riderMobile,
            riderVehicle,
            riderAddress,
            riderPhoto,
            status: 'active' // Explicitly enforced as active
        });

        await newRider.save();
        res.status(201).json({ success: true, rider: newRider, message: "Rider profile created successfully with active status." });
    } catch (err) {
        console.error("Error saving rider profile:", err);
        res.status(500).json({ error: "Failed to save rider profile to database." });
    }
});
// Route to fetch all delivery rider profiles
app.get('/api/riders', async (req, res) => {
    try {
        const riders = await Rider.find().sort({ createdAt: -1 }).lean();
        res.status(200).json(riders);
    } catch (err) {
        console.error("Error fetching riders:", err);
        res.status(500).json({ error: "Failed to fetch riders list from database." });
    }
});

// Completed bills assigned to one rider, used for that rider's delivery history.
app.get('/api/riders/:id/deliveries', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Invalid rider ID.' });
        }
        const rider = await Rider.findById(req.params.id).select('riderCode').lean();
        if (!rider) return res.status(404).json({ error: 'Rider not found.' });

        const assignmentMatch = [{ riderId: rider._id }];
        if (rider.riderCode) assignmentMatch.push({ riderCode: rider.riderCode });
        const deliveries = await Bill.find({
            $and: [
                { isDeleted: { $ne: true } },
                { $or: assignmentMatch },
                { $or: [{ Status: /^completed?$/i }, { orderStatus: /^completed?$/i }] }
            ]
        })
            .select('id customer total date updatedAt Status orderStatus')
            .sort({ updatedAt: -1, date: -1 })
            .lean();
        res.json(deliveries);
    } catch (err) {
        console.error('Failed to fetch rider deliveries:', err);
        res.status(500).json({ error: 'Failed to fetch rider deliveries.' });
    }
});

// Activate or deactivate a rider without removing their delivery history.
app.patch('/api/riders/:id/status', isAuthenticated, async (req, res) => {
    try {
        const status = String(req.body.status || '').toLowerCase();
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'Status must be active or inactive.' });
        }
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Invalid rider ID.' });
        }

        const rider = await Rider.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true, runValidators: true }
        );
        if (!rider) return res.status(404).json({ error: 'Rider not found.' });
        res.json({ success: true, rider, message: `Rider ${status === 'active' ? 'activated' : 'deactivated'} successfully.` });
    } catch (err) {
        console.error('Failed to update rider status:', err);
        res.status(500).json({ error: 'Failed to update rider status.' });
    }
});

// Permanently remove a rider profile.
app.delete('/api/riders/:id', isAuthenticated, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'Invalid rider ID.' });
        }
        const rider = await Rider.findByIdAndDelete(req.params.id);
        if (!rider) return res.status(404).json({ error: 'Rider not found.' });
        res.json({ success: true, message: 'Rider deleted successfully.' });
    } catch (err) {
        console.error('Failed to delete rider:', err);
        res.status(500).json({ error: 'Failed to delete rider.' });
    }
});
app.put('/api/bills/:id', async (req, res) => {
    try {
        const billId = req.params.id; 
        const updateData = req.body;

        if (Object.hasOwn(updateData, 'advance') || Object.hasOwn(updateData, 'paymentStatus')) {
            const existingBill = await Bill.findOne({ _id: billId, isDeleted: { $ne: true } });
            if (!existingBill) return res.status(404).send('Bill not found');

            const storedSaleTotal = Number(existingBill.saleTotal);
            const subtotal = Number(existingBill.subtotal);
            const discount = Number(existingBill.discount) || 0;
            const saleTotal = Number.isFinite(storedSaleTotal)
                ? storedSaleTotal
                : Number.isFinite(subtotal)
                    ? Math.max(0, subtotal - discount)
                    : Math.max(0, Number(existingBill.total || 0) + Number(existingBill.advance || 0));
            const paidAmount = Math.min(saleTotal, Math.max(0, Number(updateData.advance) || 0));
            const balance = Math.max(0, saleTotal - paidAmount);

            updateData.saleTotal = saleTotal;
            updateData.advance = paidAmount;
            updateData.total = balance;
            updateData.balance = balance;
            updateData.paymentStatus = balance <= 0.005 ? 'paid' : 'unpaid';
            const requestedMode = String(updateData.paymentMode || existingBill.paymentMode || 'cash').toLowerCase();
            updateData.paymentMode = requestedMode === 'online' ? 'upi' : (['cash', 'upi', 'debitcard', 'split'].includes(requestedMode) ? requestedMode : (paidAmount > 0 ? 'cash' : 'unpaid'));
            if (Array.isArray(updateData.paymentBreakdown)) {
                updateData.paymentBreakdown = updateData.paymentBreakdown
                    .map(payment => ({ mode: String(payment.mode || '').toLowerCase(), amount: Math.max(0, Number(payment.amount) || 0) }))
                    .map(payment => payment.mode === 'online' ? { ...payment, mode: 'upi' } : payment)
                    .filter(payment => ['cash', 'upi', 'debitcard'].includes(payment.mode) && payment.amount > 0);
            } else if (paidAmount <= 0) {
                updateData.paymentBreakdown = [];
            } else {
                const oldBreakdown = Array.isArray(existingBill.paymentBreakdown) ? existingBill.paymentBreakdown : [];
                const oldPaid = oldBreakdown.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
                if (updateData.paymentMode === 'split' && oldPaid > 0) {
                    let allocated = 0;
                    updateData.paymentBreakdown = oldBreakdown.map((payment, index) => {
                        const amount = index === oldBreakdown.length - 1
                            ? paidAmount - allocated
                            : Math.round(paidAmount * (Math.max(0, Number(payment.amount) || 0) / oldPaid) * 100) / 100;
                        allocated += amount;
                        return { mode: payment.mode, amount };
                    });
                } else {
                    const mode = ['cash', 'upi', 'debitcard'].includes(updateData.paymentMode) ? updateData.paymentMode : 'cash';
                    updateData.paymentMode = mode;
                    updateData.paymentBreakdown = [{ mode, amount: paidAmount }];
                }
            }
        }

        const updatedBill = await Bill.findOneAndUpdate({ _id: billId, isDeleted: { $ne: true } }, updateData, { returnDocument: 'after' });
        
        if (!updatedBill) {
            return res.status(404).send("Bill not found");
        }

        const logEntry = `Updated: Advance to ${updateData.advance}, Delivery: ${updateData.deliveryDate} ${updateData.deliveryTime}`;
        
        const newHistory = new History({
            bill_id: updatedBill.id, 
            edit_date: new Date().toLocaleString(),
            change_log: logEntry
        });
        await newHistory.save();
        
        res.json({ message: "Updated and Logged" });
    } catch (err) { 
        res.status(500).send(err); 
    }
});

app.get('/api/bills/:id/history', async (req, res) => {
    try {
        const history = await History.find({ bill_id: req.params.id }).sort({ _id: -1 });
        res.json(history);
    } catch (err) { res.status(500).send(err); }
});

app.get('/api/recently-deleted-bills', isAuthenticated, async (req, res) => {
    try {
        const bills = await Bill.find({ isDeleted: true })
            .sort({ deletedAt: -1 })
            .limit(500)
            .lean();
        res.json(bills);
    } catch (err) {
        console.error('Failed to load recently deleted bills:', err);
        res.status(500).json({ error: 'Failed to load recently deleted bills.' });
    }
});

app.delete('/api/bills/:id', isAuthenticated, async (req, res) => {
    try {
        const currentUser = await User.findOne({ username: req.session.user }).select('username').lean();
        if (!currentUser) return res.status(401).json({ error: 'Unauthorized. Please login.' });
        const bill = await Bill.findOneAndUpdate(
            { id: req.params.id, isDeleted: { $ne: true } },
            { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: currentUser.username } },
            { new: true }
        ).select('id deletedAt deletedBy');
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });
        try {
            await new History({
                bill_id: bill.id,
                edit_date: new Date().toLocaleString(),
                change_log: `Invoice moved to Recently Deleted by ${currentUser.username}`
            }).save();
        } catch (historyError) {
            console.error('Could not record invoice move to recently deleted:', historyError);
        }
        res.json({ success: true, message: 'Bill moved to Recently Deleted Invoices.', bill });
    } catch (err) { res.status(500).send(err); }
});

app.delete('/api/recently-deleted-bills/:id', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        const bill = await Bill.findOneAndDelete({ id: req.params.id, isDeleted: true });
        if (!bill) return res.status(404).json({ error: 'Recently deleted invoice not found.' });
        await History.deleteMany({ bill_id: bill.id });
        res.json({ success: true, message: 'Invoice permanently deleted.' });
    } catch (err) {
        console.error('Failed to permanently delete bill:', err);
        res.status(500).json({ error: 'Failed to permanently delete invoice.' });
    }
});

app.get('/api/menu', async (req, res) => {
    try {
        const items = await Menu.find();
        res.json(items);
    } catch (err) { res.status(500).send(err); }
});

app.post('/api/menu', async (req, res) => {
    try {
        const newItem = new Menu(req.body);
        await newItem.save();
        res.json(newItem);
    } catch (err) { res.status(500).send(err); }
});

app.put('/api/menu/bulk', async (req, res) => {
    try {
        const items = req.body?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'A non-empty items array is required.' });
        }
        const operations = items.map(item => {
            const price = Number(item.price);
            if (!item || !mongoose.isValidObjectId(item._id) || typeof item.name !== 'string' || !item.name.trim() || typeof item.category !== 'string' || !item.category.trim() || !Number.isFinite(price) || price < 0) {
                throw new Error('Each item needs a valid id, name, category, and non-negative price.');
            }
            return { updateOne: { filter: { _id: item._id }, update: { $set: { name: item.name.trim(), category: item.category.trim(), price } } } };
        });
        const result = await Menu.bulkWrite(operations, { ordered: true });
        if (result.matchedCount !== items.length) return res.status(404).json({ error: 'One or more menu items were not found.' });
        res.json({ success: true, updatedCount: result.modifiedCount });
    } catch (err) {
        const status = err.message.startsWith('Each item') ? 400 : 500;
        res.status(status).json({ error: err.message });
    }
});

app.put('/api/menu/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid menu item id.' });
        const { name, category, price } = req.body;
        const numericPrice = Number(price);
        if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() || price === '' || !Number.isFinite(numericPrice) || numericPrice < 0) {
            return res.status(400).json({ error: 'A name, category, and non-negative price are required.' });
        }
        const updatedItem = await Menu.findByIdAndUpdate(req.params.id, { $set: { name: name.trim(), category: category.trim(), price: numericPrice } }, { new: true, runValidators: true });
        if (!updatedItem) return res.status(404).json({ error: 'Menu item not found.' });
        res.json(updatedItem);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update menu item.' });
    }
});
app.delete('/api/menu/:id', async (req, res) => {
    try {
        await Menu.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { 
        res.status(500).send(err); 
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    
    if (user) {
        req.session.user = username; 
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

app.post('/api/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    } else {
        res.json({ success: true });
    }
});

app.get('/api/customers/:phone/history', async (req, res) => {
    try {
        const { phone } = req.params;
        const orders = await Bill.find({ phone: phone, isDeleted: { $ne: true } }).sort({ date: -1, _id: -1 });

        let profile = { name: "", address: "" };
        if (orders.length > 0) {
            profile.name = orders[0].customer || "";
            profile.address = orders[0].address || "";
        }

        res.json({
            profile: profile,
            history: orders
        });

    } catch (error) {
        console.error("Error fetching customer history:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.patch('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const updates = req.body; 

        const updatedUser = await User.findOneAndUpdate(
            { username: username },
            { $set: updates },
            { returnDocument: 'after' }
        );

        if (!updatedUser) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, message: "User updated successfully" });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

// =================================================================
// --- BASKET API ENDPOINTS FOR CLIENT HOME & ADMIN VIEW ---
// =================================================================

app.get('/api/basket-items', async (req, res) => {
    try {
        const items = await BasketItem.find();
        res.json(items); 
    } catch (err) { 
        res.status(500).json({ error: "Could not fetch basket items from database" }); 
    }
});

app.post('/api/basket-items', async (req, res) => {
    try {
        const newItem = new BasketItem(req.body);
        await newItem.save(); 
        res.json({ success: true, item: newItem });
    } catch (err) { 
        res.status(500).json({ error: "Could not save the new basket item" }); 
    }
});

app.delete('/api/basket-items/:id', async (req, res) => {
    try {
        const deletedItem = await BasketItem.findByIdAndDelete(req.params.id);
        if (!deletedItem) {
            return res.status(404).json({ error: "Basket item not found" });
        }
        res.json({ success: true, message: "Basket variation removed successfully" });
    } catch (err) { 
        res.status(500).json({ error: "Failed to delete the basket item" }); 
    }
});

app.patch('/api/bills/:id/cancel', async (req, res) => {
    const billId = req.params.id;
    const { orderStatus, cancellationNote } = req.body;

    if (!cancellationNote || cancellationNote.trim() === "") {
        return res.status(400).json({ error: "Cancellation note is required" });
    }

    try {
        const result = await Bill.updateOne(
            { id: billId, isDeleted: { $ne: true } }, 
            { 
                $set: { 
                    // Keep the two legacy status fields in sync. Older screens read
                    // `Status`, while the billing screen reads `orderStatus`.
                    orderStatus: orderStatus,
                    Status: orderStatus,
                    cancellationNote: cancellationNote 
                } 
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Bill not found" });
        }

        res.status(200).json({ message: "Order cancelled successfully and fields created" });
    } catch (err) {
        console.error("Database error while cancelling order:", err);
        res.status(500).json({ error: "Internal server database error" });
    }
});

// Catch-all Route
app.use((req, res) => {
    res.redirect('/');
});

app.listen(3000, '0.0.0.0', () => {
    console.log("Fruit'z Cloud Server is LIVE.");
});
HistorySchema.index({ bill_id: 1, _id: -1 });

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

// 1. Main Home URL for customers (Loads your fruit baskets page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'userhomepage.html'));
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
        const query = Bill.find().sort({ date: -1 }).lean();
        // Dashboard cards do not use bill line items, so avoid transferring them.
        if (req.query.summary === '1') query.select('-items');
        const bills = await query;
        res.json(bills);
    } catch (err) { res.status(500).send(err); }
});

app.get('/api/bills/:id', async (req, res) => {
    try {
        const billId = req.params.id;
        const bill = await Bill.findOne({ $or: [{ id: billId }, { invoiceNo: billId }] }).lean(); 
        
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
        const total = parseFloat(data.total) || 0;
        const advance = parseFloat(data.advance) || 0;
        
        let balance = total - advance;
        
        if (data.orderSource === "ONLINE") {
            balance = 0;
        }
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
            total: total,
            advance: advance,
            balance: balance 
        });
        
        await newBill.save();
        res.json({ success: true });
    } catch (err) { 
        res.status(500).send(err); 
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
            { $or: [{ id: billId }, { invoiceNo: billId }] },
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
            { id: billId },
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
app.put('/api/bills/:id', async (req, res) => {
    try {
        const billId = req.params.id; 
        const updateData = req.body;
        
        const updatedBill = await Bill.findByIdAndUpdate(billId, updateData, { returnDocument: 'after' });
        
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

app.delete('/api/bills/:id', async (req, res) => {
    try {
        await Bill.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).send(err); }
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
        const orders = await Bill.find({ phone: phone }).sort({ date: -1, _id: -1 });

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
            { id: billId }, 
            { 
                $set: { 
                    orderStatus: orderStatus,          
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

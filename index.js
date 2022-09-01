const express = require("express");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const admin = require("firebase-admin");
const serviceAccount = require("./doctors-portal-firebase-adminsdk.json");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ftrdn.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verify(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const idToken = req.headers.authorization.split(" ")[1];
    console.log(idToken);
    try {
      const decodedUser = await admin.auth().verifyIdToken(idToken);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    console.log("connected to db");

    const database = client.db("doctors_portal");
    const appointmentsCollection = database.collection("appointments");
    const usersCollection = database.collection("users");

    app.get("/appointments", verify, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;

      const decodedEmail = req.decodedEmail;
      if (decodedEmail) {
        const query = { email: email, serviceDate: date };
        const cursor = appointmentsCollection.find(query);
        const result = await cursor.toArray();
        res.json(result);
      }
      else{
          res.status(401).json({message: 'You are not authorized'})
      }
    });


    app.get('/appointments/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    })

    app.put('/appointments/:id', async(req, res) => {
      const id = req.params.id;
      const paymentInfo = req.body;
      const query = {_id: ObjectId(id)};
      const doc = {$set: {payment: paymentInfo}};
      const result = await appointmentsCollection.updateOne(query, doc);
      res.json(result);
    })

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      // console.log(user, isAdmin);
      res.json({ admin: isAdmin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.put("/users/admin", verify, async (req, res) => {
      const email = req.body.email;
      const decodedEmail = req.decodedEmail;
      if (decodedEmail) {
        const filter = { email: decodedEmail };
        const requester = await usersCollection.findOne(filter);
        if (requester.role === "admin") {
          const query = { email: email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(query, updateDoc);
          // console.log(decodedEmail);
          res.json(result);
        } else {
          res.status(401).json({ message: "you are not an admin" });
        }
      } else {
        res.status(404).json({ message: "you are not a valid user" });
      }
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const option = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(query, updateDoc, option);
      res.json(result);
    });

    app.post("/appointments", async (req, res) => {
      const bookingInfo = req.body;
      const result = await appointmentsCollection.insertOne(bookingInfo);
      console.log("inside post");
      // console.log(bookingInfo);
      res.json(result);
    });

    app.post('/create-payment-intent', async(req,res)=>{
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        payment_method_types: ['card']
      });
      res.json({
        clientSecret: paymentIntent.client_secret,
      })
    })
    // app.get('/booking', async(req,res) => {
    //     const
    // })
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("doctors portal server running....");
});

app.listen(port, () => {
  console.log(`listening at port ${port}`);
});

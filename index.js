const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
//
const formData = require("form-data");
const Mailgun = require("mailgun.js");
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAIL_GUN_API_KEY,
});

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.082e3cj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //user menu
    const userCollection = client.db("bistroDB").collection("users");

    //menu
    const menuCollection = client.db("bistroDB").collection("menu");

    const reviewsCollection = client.db("bistroDB").collection("reviews");

    // cart a add kora data
    const cartsCollection = client.db("bistroDB").collection("carts");

    // payment collection
    const paymentCollection = client.db("bistroDB").collection("payments");

    //jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // user verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // aitah ke paite caile
    app.get("/menu", async (req, res) => {
      const results = await menuCollection.find().toArray();
      res.send(results);
    });

    // menu post
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const results = await menuCollection.insertOne(item);
      res.send(results);
    });

    // update Menu
    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const results = await menuCollection.findOne(query);
      res.send(results);
    });

    // patch ar kaj
    app.patch("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          price: item.price,
          recipe: item.recipe,
          image: item.image,
        },
      };
      const results = await menuCollection.updateOne(filter, updatedDoc);
      res.send(results);
    });

    // menu deleted koarar jonno
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const results = await menuCollection.deleteOne(query);
      res.send(results);
    });

    // data paowar jonno
    app.get("/reviews", async (req, res) => {
      const results = await reviewsCollection.find().toArray();
      res.send(results);
    });

    // carts collection
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const results = await cartsCollection.insertOne(cartItem);
      res.send(results);
    });

    // cart data paowar jonno and email diya user ar data dekhano
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const results = await cartsCollection.find(query).toArray();
      res.send(results);
    });

    // cart theke deleted korar jonne
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      results = await cartsCollection.deleteOne(query);
      res.send(results);
    });

    //users related api
    app.post("/users", async (req, res) => {
      const user = req.body;
      //insert email if user doesn't exist
      // you can do this many ways(1.email unique 2. upsert 3. simple checking)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      //
      const results = await userCollection.insertOne(user);
      res.send(results);
    });

    // user ar email paower jonno
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const results = await userCollection.find().toArray();
      res.send(results);
    });

    // admin check korar jonno
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // user email deleted korar jonno
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const results = await userCollection.deleteOne(query);
      res.send(results);
    });

    // jodi admin korte cai
    app.patch(
      "/users/admin/:id",
      verifyAdmin,
      verifyToken,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const results = await userCollection.updateOne(filter, updatedDoc);
        res.send(results);
      }
    );

    //payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResults = await paymentCollection.insertOne(payment);

      // carefully deleted each item from the cart
      console.log("payment info", payment);

      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResults = await cartsCollection.deleteMany(query);

      // send user email about payment confirmation
      mg.messages
        .create(process.env.MAIL_SENDING_DOMAIN, {
          from: "Mailgun Sandbox <postmaster@sandboxac38c87109894e5b995767f4258fc9b9.mailgun.org>",
          to: ["sakilislam633@gmail.com"],
          subject: "Bistro Boss Order Confirmation",
          text: "Testing some Mailgun awesomness!",
          html: `
        <div>
        <h2>Thank you for your order</h2>
        <h4> Your Transaction Id: <strong>${payment.transactionId}</strong></h4>
        <p> We would like to get your feedback about the food </p>

        </div>
        `,
        })
        .then((msg) => console.log(msg))
        .catch((err) => console.log(err));

      res.send({ paymentResults, deleteResults });
    });

    // payments ar data paowar jonno
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const results = await paymentCollection.find(query).toArray();
      res.send(results);
    });

    // stats or analytics
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const order = await paymentCollection.estimatedDocumentCount();

      // this is not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce(
      //   (total, payment) => total + payment.price,
      //   0
      // );

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$price" },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        order,
        revenue,
      });
    });

    // using aggregate pipeline
    app.get("/order-stats", async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",
          },
          {
            $lookup: {
              from: "menu",
              localField: "menuItemIds",
              foreignField: "_id",
              as: "menuItems",
            },
          },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: { $sum: 1 },
              revenue: { $sum: "$menuItems.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$revenue",
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("boos is sitting");
});

app.listen(port, () => {
  console.log(`Bistro is sitting on port ${port}`);
});

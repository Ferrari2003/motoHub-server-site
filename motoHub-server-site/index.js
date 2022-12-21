const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 4000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(cors());
app.use(express.json());

//mongodbapi
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rfyyfuu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
// JWT
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWTOKEN, function (err, decoded) {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
}

//mongodb try function start---
async function run() {
  try {
    const productCollection = client.db("MotoHub").collection("products");
    const usersCollection = client.db("MotoHub").collection("users");
    const orderCollection = client.db("MotoHub").collection("orders");
    const wishlistCollection = client.db("MotoHub").collection("wishlist");
    const paymentCollection = client.db("MotoHub").collection("payments");

    // Add Product
    app.post("/add-product", async (req, res) => {
      const product = req.body;

      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    // get product by email
    app.get("/products/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        seller_email: email,
      };
      const cursor = productCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    // delete product by id
    app.post("/product/delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    // update product advertise satatus by id
    app.put("/product/edit/:id", async (req, res) => {
      const productId = req.params.id;
      const orderId = req.headers.id;
      const update = await req.body;

      const productFilter = { _id: ObjectId(productId) };
      const orderFilter = { _id: ObjectId(orderId) };
      const option = { upsert: true };
      const updateProduct = {
        $set: {
          advertise: update.advertise,
          status: update.status,
        },
      };
      const updateOrder = {
        $set: {
          paid: true,
        },
      };

      const result = await productCollection.updateOne(
        productFilter,
        updateProduct,
        option
      );
      if (orderId) {
        const orderUpdate = await orderCollection.updateOne(
          orderFilter,
          updateOrder,
          option
        );
      }

      res.send(result);
    });

    // get advertise product array

    app.get("/products", async (req, res) => {
      const query = {
        advertise: "true",
      };
      const cursor = productCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    // get products by category
    app.get("/products/category/:id", async (req, res) => {
      const categoryId = req.params.id;
      const query = {
        category: categoryId,
        status: "Available",
      };
      const cursor = productCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    // order create
    app.post("/order", async (req, res) => {
      const order = req.body;
      const query = {
        product_id: order.product_id,
        customer_email: order.customer_email,
      };
      const isOrdered = await orderCollection.find(query).toArray();

      if (isOrdered.length < 1) {
        const result = await orderCollection.insertOne(order);
        res.send(result);
      } else {
        res.status(401).send({ error: "Already ordered" });
      }
    });

    // get order by email or id
    app.get("/order", async (req, res) => {
      const query = {
        $or: [
          { customer_email: req.query.email },
          { _id: ObjectId(req.query.id) },
        ],
      };
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    });

    // save wishlist

    app.post("/wishlist", async (req, res) => {
      const wishlist = req.body;
      const query = {
        product_id: wishlist.product_id,
        customer_email: wishlist.customer_email,
      };
      const isAded = await wishlistCollection.find(query).toArray();

      if (isAded.length < 1) {
        const result = await wishlistCollection.insertOne(wishlist);
        res.send(result);
      } else {
        res.status(401).send({ error: "Already Aded" });
      }
    });

    // Undo wishlist by product id
    app.post("/wishlist/delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: ObjectId(id),
      };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });

    // get wishlist by email or product_id
    app.get("/wishlist", async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;

      const query = {
        $or: [{ customer_email: email }, { product_id: id }],
      };

      const result = await wishlistCollection.find(query).toArray();
      res.send(result);
    });

    // payment

    app.post("/create-payment-intent", async (req, res) => {
      const order = req.body;

      const price = +order.price;

      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // save payment to db
    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      const id = payment.order_id;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      res.send(result);
    });
    // get jwt token
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.JWTOKEN, {
          expiresIn: "1 day",
        });
        res.send({ accessToken: token });
      } else {
        res.send({ accessToken: "" });
      }
    });

    // create user in db
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const isUserAvailable = await usersCollection.findOne(query);
      if (!isUserAvailable) {
        const result = await usersCollection.insertOne(user);
        res.send(result);
      }
    });

    // get users from db according to role
    app.get("/users", async (req, res) => {
      const role = req.query.role;
      const query = { role: role };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // user delete by id
    app.post("/users/delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const body = req.body;

      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // make seller verify by id
    app.put("/users/edit/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const verify = req.headers.verify;
      const option = { upsert: true };
      const updatedUser = {
        $set: {
          verify: verify,
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedUser,
        option
      );
      res.send(result);
    });

    // get users  role by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // is user verified seller api
    app.get("/users/verify/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isVerify: user?.verify === "true" });
    });
  } finally {
  }
}
run().catch((error) => console.log(error));

// Express
app.listen(port, () => {
  console.log("Server running on port", port);
});

app.get("/", (req, res) => {
  res.send("Server Running");
});

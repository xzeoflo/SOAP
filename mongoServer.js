const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { MongoClient, ObjectId } = require("mongodb");
const z = require("zod");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 8000;

const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ProductSchema = z.object({
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
  categoryIds: z.array(z.string())
});

const CategorySchema = z.object({
  name: z.string()
});

app.post("/categories", async (req, res) => {
  const result = CategorySchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { name } = result.data;
  const ack = await db.collection("categories").insertOne({ name });
  res.send({ _id: ack.insertedId, name });
});

app.post("/products", async (req, res) => {
  const result = ProductSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { name, about, price, categoryIds } = result.data;
  const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));

  const ack = await db.collection("products").insertOne({
    name,
    about,
    price,
    categoryIds: categoryObjectIds
  });

  const newProduct = { _id: ack.insertedId, name, about, price, categoryIds: categoryObjectIds };
  io.emit("products", { action: "CREATE", data: newProduct });
  res.send(newProduct);
});

app.get("/products", async (req, res) => {
  const result = await db.collection("products").aggregate([
    { $match: {} },
    {
      $lookup: {
        from: "categories",
        localField: "categoryIds",
        foreignField: "_id",
        as: "categories"
      }
    }
  ]).toArray();
  res.send(result);
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).send({ message: "Not found" });
    res.send(product);
  } catch (err) {
    res.status(400).send({ message: "Invalid ID format" });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const result = ProductSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const { name, about, price, categoryIds } = result.data;
    const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));

    const updated = await db.collection("products").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { name, about, price, categoryIds: categoryObjectIds } },
      { returnDocument: "after" }
    );

    if (!updated) return res.status(404).send({ message: "Not found" });
    io.emit("products", { action: "UPDATE", data: updated });
    res.send(updated);
  } catch (err) {
    res.status(400).send({ message: "Invalid ID format" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const deleted = await db.collection("products").findOneAndDelete({ _id: new ObjectId(req.params.id) });
    if (!deleted) return res.status(404).send({ message: "Not found" });

    io.emit("products", { action: "DELETE", data: deleted });
    res.send(deleted);
  } catch (err) {
    res.status(400).send({ message: "Invalid ID format" });
  }
});

client.connect().then(() => {
  db = client.db("myDB");
  server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
});
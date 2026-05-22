const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");
const swaggerUi = require("swagger-ui-express");

const app = express();
const port = 8000;

const sql = postgres({ db: "mydb", user: "user", password: "password" });

app.use(express.json());

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
  rating_score: z.number().optional()
});

const CreateProductSchema = ProductSchema.omit({ id: true, rating_score: true });

const UserSchema = z.object({
  id: z.string(),
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6)
});

const CreateUserSchema = UserSchema.omit({ id: true });
const UpdateUserSchema = UserSchema.omit({ id: true });
const PatchUserSchema = UserSchema.omit({ id: true }).partial();

const OrderSchema = z.object({
  userId: z.number(),
  productIds: z.array(z.number())
});

const ReviewSchema = z.object({
  userId: z.number(),
  productId: z.number(),
  score: z.number().min(1).max(5),
  content: z.string()
});

function hashPassword(password) {
  return crypto.createHash("sha512").update(password).digest("hex");
}

app.post("/products", async (req, res) => {
  const result = CreateProductSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { name, about, price } = result.data;
  const product = await sql`
    INSERT INTO products (name, about, price) 
    VALUES (${name}, ${about}, ${price}) 
    RETURNING *
  `;
  res.send(product[0]);
});

app.get("/products", async (req, res) => {
  const { name, about, price } = req.query;
  
  let query = sql`SELECT * FROM products WHERE 1=1`;
  
  if (name) query = sql`${query} AND name ILIKE ${'%' + name + '%'}`;
  if (about) query = sql`${query} AND about ILIKE ${'%' + about + '%'}`;
  if (price) query = sql`${query} AND price <= ${parseFloat(price)}`;

  const products = await query;
  res.send(products);
});

app.get("/products/:id", async (req, res) => {
  const product = await sql`SELECT * FROM products WHERE id = ${req.params.id}`;
  if (product.length === 0) return res.status(404).send({ message: "Not found" });

  const reviews = await sql`SELECT id, user_id, score, content, created_at FROM reviews WHERE product_id = ${req.params.id}`;
  
  res.send({
    ...product[0],
    reviews: reviews
  });
});

app.delete("/products/:id", async (req, res) => {
  const product = await sql`
    DELETE FROM products 
    WHERE id = ${req.params.id} 
    RETURNING *
  `;
  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.post("/users", async (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { username, email, password } = result.data;
  const hashedPassword = hashPassword(password);

  try {
    const user = await sql`
      INSERT INTO users (username, email, password) 
      VALUES (${username}, ${email}, ${hashedPassword}) 
      RETURNING id, username, email
    `;
    res.send(user[0]);
  } catch (err) {
    res.status(400).send({ message: "Email or username already exists" });
  }
});

app.get("/users", async (req, res) => {
  const users = await sql`SELECT id, username, email FROM users`;
  res.send(users);
});

app.get("/users/:id", async (req, res) => {
  const user = await sql`SELECT id, username, email FROM users WHERE id = ${req.params.id}`;
  if (user.length > 0) {
    res.send(user[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.put("/users/:id", async (req, res) => {
  const result = UpdateUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { username, email, password } = result.data;
  const hashedPassword = hashPassword(password);

  const user = await sql`
    UPDATE users 
    SET username = ${username}, email = ${email}, password = ${hashedPassword} 
    WHERE id = ${req.params.id} 
    RETURNING id, username, email
  `;

  if (user.length > 0) {
    res.send(user[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.patch("/users/:id", async (req, res) => {
  const result = PatchUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const updateData = result.data;
  if (updateData.password) {
    updateData.password = hashPassword(updateData.password);
  }

  const current = await sql`SELECT * FROM users WHERE id = ${req.params.id}`;
  if (current.length === 0) return res.status(404).send({ message: "Not found" });

  const finalData = { ...current[0], ...updateData };

  const user = await sql`
    UPDATE users 
    SET username = ${finalData.username}, email = ${finalData.email}, password = ${finalData.password} 
    WHERE id = ${req.params.id} 
    RETURNING id, username, email
  `;
  res.send(user[0]);
});

app.delete("/users/:id", async (req, res) => {
  const user = await sql`DELETE FROM users WHERE id = ${req.params.id} RETURNING id, username, email`;
  if (user.length > 0) {
    res.send(user[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.get("/f2p-games", async (req, res) => {
  try {
    const response = await fetch("https://www.freetogame.com/api/games");
    const games = await response.json();
    res.send(games);
  } catch (err) {
    res.status(500).send({ message: "External API Error" });
  }
});

app.get("/f2p-games/:id", async (req, res) => {
  try {
    const response = await fetch(`https://www.freetogame.com/api/game?id=${req.params.id}`);
    if (response.status === 404) return res.status(404).send({ message: "Game not found" });
    const game = await response.json();
    res.send(game);
  } catch (err) {
    res.status(500).send({ message: "External API Error" });
  }
});

app.post("/orders", async (req, res) => {
  const result = OrderSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { userId, productIds } = result.data;

  const products = await sql`SELECT price FROM products WHERE id IN (${productIds})`;
  if (products.length !== productIds.length) return res.status(400).send({ message: "One or more product IDs are invalid" });

  const subtotal = products.reduce((sum, p) => sum + parseFloat(p.price), 0);
  const total = subtotal * 1.2;

  const order = await sql`
    INSERT INTO orders (user_id, product_ids, total, payment, created_at, updated_at) 
    VALUES (${userId}, ${productIds}, ${total}, false, NOW(), NOW()) 
    RETURNING *
  `;
  res.send(order[0]);
});

app.get("/orders", async (req, res) => {
  const orders = await sql`SELECT * FROM orders`;
  const detailedOrders = [];

  for (const order of orders) {
    const user = await sql`SELECT id, username, email FROM users WHERE id = ${order.user_id}`;
    const products = await sql`SELECT * FROM products WHERE id IN (${order.product_ids})`;
    
    detailedOrders.push({
      id: order.id,
      total: order.total,
      payment: order.payment,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      user: user[0] || null,
      products: products
    });
  }
  res.send(detailedOrders);
});

app.post("/reviews", async (req, res) => {
  const result = ReviewSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const { userId, productId, score, content } = result.data;

  const productCheck = await sql`SELECT id FROM products WHERE id = ${productId}`;
  if (productCheck.length === 0) return res.status(404).send({ message: "Product not found" });

  const review = await sql`
    INSERT INTO reviews (user_id, product_id, score, content, created_at, updated_at) 
    VALUES (${userId}, ${productId}, ${score}, ${content}, NOW(), NOW()) 
    RETURNING *
  `;

  const avgRes = await sql`SELECT AVG(score) as average FROM reviews WHERE product_id = ${productId}`;
  const newRating = parseFloat(avgRes[0].average) || 0;

  await sql`UPDATE products SET rating_score = ${newRating} WHERE id = ${productId}`;

  res.send(review[0]);
});

const swaggerDocument = {
  openapi: "3.0.0",
  info: { title: "Marketplace REST API", version: "1.0.0" },
  paths: {
    "/products": {
      get: { responses: { 200: { description: "Success" } } },
      post: { responses: { 200: { description: "Success" } } }
    },
    "/users": {
      get: { responses: { 200: { description: "Success" } } },
      post: { responses: { 200: { description: "Success" } } }
    },
    "/f2p-games": {
      get: { responses: { 200: { description: "Success" } } }
    }
  }
};

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
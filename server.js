const soap = require("soap");
const fs = require("node:fs");
const http = require("http");
const postgres = require("postgres");

const sql = postgres({ db: "mydb", user: "user", password: "password" });

const service = {
  ProductsService: {
    ProductsPort: {
      CreateProduct: async function ({ name, about, price }, callback) {
        if (!name || !about || !price) {
          throw {
            Fault: {
              Code: { Value: "soap:Sender", Subcode: { value: "rpc:BadArguments" } },
              Reason: { Text: "Processing Error" },
              statusCode: 400,
            },
          };
        }
        const product = await sql`
          INSERT INTO products (name, about, price)
          VALUES (${name}, ${about}, ${price})
          RETURNING *
        `;
        callback(product[0]);
      },

      GetProducts: async function (args, callback) {
        try {
          const products = await sql`SELECT * FROM products`;
          callback({ Product: products });
        } catch (err) {
          throw { Fault: { Code: { Value: "soap:Receiver" }, Reason: { Text: "Database Error" }, statusCode: 500 } };
        }
      },

      PatchProduct: async function (args, callback) {
        if (!args.id) {
          throw {
            Fault: {
              Code: { Value: "soap:Sender", Subcode: { value: "rpc:BadArguments" } },
              Reason: { Text: "ID is required for Patch" },
              statusCode: 400,
            },
          };
        }
        
        const updates = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.about !== undefined) updates.about = args.about;
        if (args.price !== undefined) updates.price = args.price;

        if (Object.keys(updates).length === 0) {
          throw { Fault: { Code: { Value: "soap:Sender" }, Reason: { Text: "No fields to update" }, statusCode: 400 } };
        }

        const product = await sql`
          UPDATE products SET ${sql(updates)}
          WHERE id = ${args.id}
          RETURNING *
        `;

        if (product.length === 0) {
          throw { Fault: { Code: { Value: "soap:Sender" }, Reason: { Text: "Product Not Found" }, statusCode: 404 } };
        }

        callback(product[0]);
      },

      DeleteProduct: async function ({ id }, callback) {
        if (!id) {
          throw {
            Fault: {
              Code: { Value: "soap:Sender", Subcode: { value: "rpc:BadArguments" } },
              Reason: { Text: "ID is required for Delete" },
              statusCode: 400,
            },
          };
        }

        const result = await sql`
          DELETE FROM products WHERE id = ${id}
          RETURNING id
        `;

        callback({ success: result.length > 0 });
      },
    },
  },
};

const server = http.createServer(function (request, response) {
  response.end("404: Not Found: " + request.url);
});

server.listen(8000);

const xml = fs.readFileSync("productsService.wsdl", "utf8");
soap.listen(server, "/products", service, xml, function () {
  console.log("SOAP server running at http://localhost:8000/products?wsdl");
});
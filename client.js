const soap = require("soap");

const url = "http://localhost:8000/products?wsdl";

soap.createClient(url, {}, function (err, client) {
  if (err) return console.error(err);

  client.CreateProduct({ name: "Jeu Test", about: "Description", price: 50 }, function (err, res) {
    if (err) return console.error("Create Error:", err.body);
    const newId = res.id;
    console.log("Created ID:", newId);

    client.PatchProduct({ id: newId, price: 99 }, function (err, resPatch) {
      if (err) return console.error("Patch Error:", err.body);
      console.log("Patched Price:", resPatch.price);

      client.DeleteProduct({ id: newId }, function (err, resDel) {
        if (err) return console.error("Delete Error:", err.body);
        console.log("Delete Success:", resDel.success);
      });
    });
  });
});
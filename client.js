const soap = require("soap");
const url = "http://localhost:8000/products?wsdl";

soap.createClient(url, {}, function (err, client) {
  if (err) return console.error("Client Creation Error:", err);

  client.CreateProduct({ name: "Jeu Test", about: "Description", price: 50 }, function (err, res) {
    if (err) return console.error("Create Error:", err.body || err);
    const newId = res.id;
    console.log("-> Created ID:", newId);

    client.GetProducts({}, function (err, resGet) {
      if (err) return console.error("GetProducts Error:", err.body || err);
      console.log("-> All Products in Database:", JSON.stringify(resGet, null, 2));

      client.PatchProduct({ id: newId, price: 99 }, function (err, resPatch) {
        if (err) return console.error("Patch Error:", err.body || err);
        console.log("-> Patch Success ! New Data:", resPatch);

        client.DeleteProduct({ id: newId }, function (err, resDel) {
          if (err) return console.error("Delete Error:", err.body || err);
          console.log("-> Delete Success status:", resDel.success);
        });
      });
    });
  });
});
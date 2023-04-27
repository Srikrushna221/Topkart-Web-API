const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(bodyParser.json());

// Connect to the SQLite database
const db = new sqlite3.Database(':memory:');

// Create the lightning_deals table
db.run(`CREATE TABLE lightning_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT NOT NULL,
  actual_price REAL NOT NULL,
  final_price REAL NOT NULL,
  total_units INTEGER NOT NULL,
  available_units INTEGER NOT NULL,
  expiry_time INTEGER NOT NULL
)`);

// Insert some lightning deals
db.serialize(() => {
  const stmt = db.prepare(`INSERT INTO lightning_deals
    (product_name, actual_price, final_price, total_units, available_units, expiry_time)
    VALUES (?, ?, ?, ?, ?, ?)`);
  stmt.run('iPhone 13 Pro', 1099.99, 999.99, 100, 50, Math.floor(Date.now() / 1000));
  stmt.run('Samsung Galaxy S22', 899.99, 799.99, 50, 10, Math.floor(Date.now() / 1000) + 7200);
  stmt.run('Google Pixel 7', 749.99, 699.99, 200, 150, Math.floor(Date.now() / 1000) + 10800);
});

// Create the orders table
db.run(`CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL,
  units INTEGER NOT NULL,
  price REAL NOT NULL,
  isApproved INTEGER DEFAULT 0,
  FOREIGN KEY(deal_id) REFERENCES lightning_deals(id)
)`);

// Endpoint to get unexpired lightning deals
app.get('/lightning_deals', (req, res) => {
  db.all(`SELECT * FROM lightning_deals WHERE expiry_time > ?`, Math.floor(Date.now() / 1000), (err, rows) => {
    if (err) {
      res.status(500).send({ error: err.message });
    } else {
      res.status(200).send(rows);
    }
  });
});

// Endpoint to create a new lightning deal
app.post('/lightning_deals', (req, res) => {
  const deal = req.body;
  const stmt = db.prepare(`INSERT INTO lightning_deals
    (product_name, actual_price, final_price, total_units, available_units, expiry_time)
    VALUES (?, ?, ?, ?, ?, ?)`);
  stmt.run(deal.product_name, deal.actual_price, deal.final_price, deal.total_units, deal.available_units, deal.expiry_time, (err) => {
    if (err) {
      res.status(500).send({ error: err.message });
    } else {
      res.status(201).send({ message: 'Lightning deal created successfully' });
    }
  });
});

// Endpoint to update a lightning deal
app.put('/lightning_deals/:id', (req, res) => {
  const dealId = req.params.id;
  const deal = req.body;
  const stmt = db.prepare(`UPDATE lightning_deals SET
    product_name = ?,
    actual_price = ?,
    final_price = ?,
    total_units = ?,
    available_units = ?,
    expiry_time = ?
    WHERE id = ?`);
  stmt.run(deal.product_name
  , deal.actual_price, deal.final_price, deal.total_units, deal.available_units, deal.expiry_time, dealId, (err) => {
    if (err) {
      res.status(500).send({ error: err.message });
    } else {
      res.status(200).send({ message: 'Lightning deal updated successfully' });
    }
  });
});

// Endpoint to approve an order
app.put('/orders/:id/approve', (req, res) => {
  const orderId = req.params.id;
  const stmt = db.prepare(`UPDATE orders SET isApproved = 1 WHERE id = ?`);
  stmt.run(orderId, (err) => {
    if (err) {
      res.status(500).send({ error: err.message });
    } else {
      res.status(200).send({ message: 'Order approved successfully' });
    }
  });
});

// Endpoint to create a new order
app.post('/orders', (req, res) => {
  const order = req.body;

  db.get(`SELECT * FROM lightning_deals WHERE id = ? AND expiry_time > ?`, order.deal_id, Math.floor(Date.now() / 1000), (err, row) => {
    if (err) {
      res.status(500).send({ error: err.message });
    } else if (!row) {
      res.status(400).send({ error: 'The lightning deal has expired' });
    } else {
      if (row.available_units < order.units) {
        res.status(400).send({ error: 'Not enough units available' });
      } else {
        const totalPrice = row.final_price * order.units;
        const stmt = db.prepare(`INSERT INTO orders (deal_id, units, price) VALUES (?, ?, ?)`);
        stmt.run(order.deal_id, order.units, totalPrice, (err) => {
          if (err) {
            res.status(500).send({ error: err.message });
          } else {
            const newAvailableUnits = row.available_units - order.units;
            const stmt2 = db.prepare(`UPDATE lightning_deals SET available_units = ? WHERE id = ?`);
            stmt2.run(newAvailableUnits, order.deal_id, (err2) => {
              if (err2) {
                res.status(500).send({ error: err2.message });
              } else {
                res.status(201).send({ message: 'Order placed successfully' });
              }
            });
          }
        });
      }
    }
  });
});

// Endpoint to get the status of an order
app.get('/orders/:id/status', (req, res) => {
  const orderId = req.params.id;

  db.get(`SELECT * FROM orders WHERE id = ?`, orderId, (err, row) => {
    if (err) {
      res.status(500).send({ error: err.message });
    } else if (!row) {
      res.status(404).send({ error: 'Order not found' });
    } else {
      db.get(`SELECT * FROM lightning_deals WHERE id = ?`, row.deal_id, (err2, row2) => {
        if (err2) {
          res.status(500).send({ error: err2.message });
        } else if (!row2) {
          res.status(404).send({ error: 'Lightning deal not found' });
        } else {
          const status = {
            id: row.id,
            deal: {
              id: row2.id,
              name: row2.name,
              actual_price: row2.actual_price,
              final_price: row2.final_price,
              total_units: row2.total_units,
              available_units: row2.available_units,
              expiry_time: row2.expiry_time
            },
            units: row.units,
            price: row.price,
            isApproved: row.isApproved
          };
          res.status(200).send(status);
        }
      });
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

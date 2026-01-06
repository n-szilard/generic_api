const express = require('express');
const router = express.Router();
const { query } = require('../utils/database');
const SHA1 = require('crypto-js/sha1');
const passwdRegExp = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const ejs = require('ejs');


var transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
})

const upload = multer({ storage: storage })

router.get('/ordersall', (req, res) => {
    query('SELECT orders.id,`userId`,`total`,`status`,orders.createdAt,`updatedAt`,GROUP_CONCAT(pizzas.name, " x ", order_items.quantity) as name, order_items.quantity FROM `orders` INNER JOIN order_items ON orders.id = order_items.orderId INNER JOIN pizzas ON order_items.pizzaId = pizzas.id GROUP BY orders.id', [], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results);
    }, req)
})

// get orders with id
router.get('/ordersall/:id', (req, res) => {
    const userId = req.params.id
    query('SELECT orders.id,`userId`,`total`,`status`,orders.createdAt,`updatedAt`,GROUP_CONCAT(pizzas.name, " x ", order_items.quantity) as name, order_items.quantity FROM `orders` INNER JOIN order_items ON orders.id = order_items.orderId INNER JOIN pizzas ON order_items.pizzaId = pizzas.id WHERE userId = ? GROUP BY orders.id', [userId], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results);
    }, req)
})

// Select All from table
router.get('/:table', (req, res) => {
    const table = req.params.table;
    query(`SELECT * FROM ${table}`, [], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
});

// SELECT one record from table with id
router.get('/:table/:id', (req, res) => {
    let table = req.params.table;
    let id = req.params.id;
    query(`SELECT * FROM ${table} WHERE id=?`, [id], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
})

// Select records from table by field with operator
router.get('/:table/:field/:op/:value', (req, res) => {
    let table = req.params.table;
    let field = req.params.field;
    let op = getOp(req.params.op);
    let value = req.params.value;
    if (req.params.op == 'lk') {
        value = `%${value}%`;
    }

    query(`SELECT * FROM ${table} WHERE ${field}${op}?`, [value], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
})

router.post('/upload', upload.array('images', 10), (req, res) => {
    const insertId = Number(req.body.insertId);
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(500).send({ error: 'Nincs fájl feltöltve!' });
    }

    for (const file of files) {
        query(
            'INSERT INTO accomodation_images (accomodationId, imagePath) VALUES (?, ?)', [insertId, file.filename], (error, results) => {
                if (error) {
                    return res.status(500).json({
                        errno: error.errno,
                        msg: 'Hiba történt az adatbázis beszúrása közben.',
                        error: error.message
                    });
                }
            },
            req
        );
    }

    res.status(200).send({
        message: 'Fájlok feltöltve!',
        count: files.length
    });
})

async function renderTemplate(templateName, data) {
    const tmpFile = path.join(__dirname, "..","templates", templateName + '.ejs')
    return await ejs.renderFile(tmpFile, data)
}

// SENDING email
router.post('/sendmail', async (req, res) => {
    const { template, to, subject, data} = req.body;
    
    if (!to || !subject || !template) {
        return res.status(400).send({ error: 'Hiányzó adatok!' });
    }


    try {
        transporter.sendMail({
            from: 'Barmi igazabol',
            to: to,
            subject: subject,
            html: await renderTemplate(template, data || {})
        })

        return res.status(200).send({ message: 'E-mail küldése sikeres!' })
    } catch (err) {
        console.log(err);
        return res.status(500).send({ error: 'Hiba az email küldése közben! ' + err.message})
    }

})

// LOGIN
router.post('/:table/login', (req, res) => {
    let table = req.params.table;
    let { email, password } = req.body;

    if (!email || !password) {
        res.status(400).send({ error: 'Hiányzó adatok!' });
        return;
    }

    // TODO: Validáció
    query(`SELECT * FROM ${table} WHERE email=? AND password='${SHA1(password).toString()}'`, [email, password], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        if (results.length == 0) return res.status(400).json({ error: 'Hibás belépési adatok!' });
        
        if (results[0].status == 0) {
            res.status(400).send({error: 'Inaktivált felhasználó!'});
            return;
        }

        res.status(200).send(results)
    }, req);
});

// Registration
router.post('/:table/registration', (req, res) => {
    let table = req.params.table;
    let { name, email, password, confirm } = req.body;

    if (!name || !email || !password || !confirm) {
        res.status(400).send({ error: 'Hiányzó adatok!' });
        return;
    }

    if (password != confirm) {
        res.status(400).send({ error: 'A megadott jelszavak nem egyeznek!' });
        return;
    }

    if (!password.match(passwdRegExp)) {
        res.status(400).send({ error: 'A megadott jelszó nem elég biztonságos!' });
        return;
    }

    query(`SELECT id FROM ${table} WHERE email=?`, [email], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });

        if (results.length != 0) {
            res.status(400).send({ error: 'A megadott email már regisztálva van!' })
            return;
        }

        query(`INSERT INTO ${table} (name, email, password, role) VALUES (?,?,?, 'user')`, [name, email, SHA1(password).toString()], (error, results) => {

            if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
            res.status(200).send(results)
        }, req);

    }, req);

    // TODO: Validáció
});

// ADD NEW record to :table
router.post('/:table', (req, res) => {
    let table = req.params.table;

    let fields = Object.keys(req.body).join(',');
    let values = "'" + Object.values(req.body).join("', '") + "'";


    //    console.log(`INSERT INTO ${table} (${fields}) VALUES (${values})`)

    query(`INSERT INTO ${table} (${fields}) VALUES (${values})`, [], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
});

// UPDATE records in :table by :id
router.patch('/:table/:id', (req, res) => {
    let table = req.params.table;
    let id = req.params.id;

    let fields = Object.keys(req.body);
    let values = Object.values(req.body);

    let updates = [];
    for (let i = 0; i < fields.length; i++) {
        updates.push(`${fields[i]}='${values[i]}'`)
    }

    let str = updates.join(',');

    query(`UPDATE ${table} SET ${str} WHERE id=?`, [id], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
});


// DELETE one record from table by id
router.get('/:table/:id', (req, res) => {
    const table = req.params.table;
    const id = req.params.id;
    query(`SELECT * FROM ${table} WHERE id = ?`, [id], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
});

router.delete('/:table/:field/:op/:value', (req, res) => {
    let table = req.params.table;
    let field = req.params.field;
    let op = getOp(req.params.op);
    let value = req.params.value;
    if (req.params.op == 'lk') {
        value = `%${value}%`;
    }

    query(`DELETE FROM ${table} WHERE ${field}${op}?`, [value], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
})

// DELETE uploaded file
router.delete('/image/:filename', (req, res) => {
    let filename = req.params.filename;
    let newpath = path.join(__dirname, '../uploads/');
    fs.unlink(newpath+filename, (err) => {
        if (err) {
            return res.status(500).json({error: 'A fájl törlése sikertelen!'});
        }
        res.status(200).json({ message: 'A kép törölve!'});
    });
})

// DELETE one record from table by id
router.delete('/:table/:id', (req, res) => {
    const table = req.params.table;
    const id = req.params.id;
    query(`DELETE FROM ${table} WHERE id = ?`, [id], (error, results) => {
        if (error) return res.status(500).json({ errno: error.errno, msg: 'Hiba történt az adatbázis lekérdezése közben.', error: error.message });
        res.send(results)
    }, req)
});

function getOp(op) {
    switch (op) {
        case 'eq': { op = '='; break; }
        case 'lt': { op = '<'; break; }
        case 'lte': { op = '<='; break; }
        case 'gt': { op = '>'; break; }
        case 'gte': { op = '>='; break; }
        case 'not': { op = '<>'; break; }
        case 'lk': { op = ' like '; break; }

    }
    return op;
}


module.exports = router;
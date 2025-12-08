const express = require('express');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv').config();
const logger = require('./utils/logger')
const nodemailer = require('nodemailer');

const tables = require('./modules/tables')


const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use('/', tables);


app.get('/', (req, res) => {
    res.send('Nagyapáti Szilárd 13.A generic api');
});

app.listen(process.env.PORT, () => {
    logger.info('Server listening on http://localhost:' + process.env.PORT)
})
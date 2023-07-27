const express = require('express');
const app = express();

const cors = require("cors");

const PORT = 80;
const bodyParser = require('body-parser');
const { utcToZonedTime } = require('date-fns-tz');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'week4'
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

connection.connect((err) => {
    if (err) {
        console.log(err);
        console.error('MySQL 서버에 접속할 수 없습니다.');
        return;
    }

    console.log('MySQL 서버에 접속되었습니다.');
});

function toDateTime(dateString) {
    return new Date(dateTimeString);
}

// 로그인 라우트를 추가
app.post('/login', (req, res) => {
    const { password, username } = req.body;
    console.log(req.body);

    // 데이터베이스에서 해당 UID와 PW를 가진 사용자 정보를 조회하는 쿼리
    const loginQuery = `
        SELECT UID
        FROM users
        WHERE PW = ? AND username = ?
    `;

    runQuery(loginQuery, [password, username])
        .then(results => {
            // 조회된 결과가 있으면 로그인 성공, 그렇지 않으면 로그인 실패
            if (results.length > 0) {
                const { UID } = results[0];
                res.status(200).json({ UID });
            } else {
                res.status(401).json({ message: '로그인 실패' });
            }
        })
        .catch(err => {
            console.error('로그인 중 오류가 발생했습니다:', err);
            res.status(500).json({ error: '로그인 오류' });
        });
});

// 회원가입 라우트를 추가
app.post('/join', (req, res) => {
    const { PW, username } = req.body;

    // 데이터베이스에 새로운 사용자 정보를 추가하는 쿼리
    const addUserQuery = `
        INSERT INTO users (PW, username)
        VALUES (?, ?)
    `;

    runQuery(addUserQuery, [PW, username])
        .then(() => {
            res.status(200).json({ message: '회원가입 성공' });
        })
        .catch(err => {
            console.error('회원가입 중 오류가 발생했습니다:', err);
            res.status(500).json({ error: '회원가입 오류' });
        });
});

app.get('/dashboard', (req, res) => {
    const { UID } = req.query;

    const tz = 'Asia/Seoul';
    const endDate = new Date();
    const zonedEndDate = utcToZonedTime(endDate, tz);
    const startDate = new Date(zonedEndDate);
    startDate.setDate(startDate.getDate() - 6);

    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = zonedEndDate.toISOString().slice(0, 10);

    const monthlyCostQuery = `
        SELECT 
            DATE_FORMAT(date, '%Y-%m') AS month,
            SUM(cost) AS total_cost
        FROM 
            books
        WHERE 
            UID = ?
        GROUP BY 
            DATE_FORMAT(date, '%Y-%m')
        ORDER BY 
            DATE_FORMAT(date, '%Y-%m')
    `;

    const weeklyCostQuery = `
        SELECT 
            CASE 
                WHEN DAYOFMONTH(date) BETWEEN 1 AND 7 THEN 1
                WHEN DAYOFMONTH(date) BETWEEN 8 AND 14 THEN 2
                WHEN DAYOFMONTH(date) BETWEEN 15 AND 21 THEN 3
                ELSE 4
            END AS week,
            SUM(cost) AS total_cost
        FROM 
            books
        WHERE 
            UID = ? AND
            DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        GROUP BY 
            week
        ORDER BY 
            week ASC
    `;

    const recentCostQuery = `
        SELECT
            DATE_FORMAT(date, '%Y-%m-%d') AS date,
            SUM(cost) AS total_cost
        FROM
            books
        WHERE
            UID = ? AND
            date >= ? AND
            date <= ?
        GROUP BY
            DATE_FORMAT(date, '%Y-%m-%d')
    `;

    const categoryCostQuery = `
        SELECT 
            category,
            SUM(cost) AS total_cost
        FROM 
            books
        WHERE 
            UID = ? AND
            DATE_FORMAT(date, '%Y-%m-%d') >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
            AND DATE_FORMAT(date, '%Y-%m-%d') <= LAST_DAY(CURDATE())
        GROUP BY 
            category
    `;

    const desiredOrder = ["식비", "주거", "교통", "쇼핑", "의료", "여가", "기타"];

    Promise.all([
        runQuery(monthlyCostQuery, [UID]),
        runQuery(weeklyCostQuery, [UID]),
        runQuery(recentCostQuery, [UID, startDateStr, endDateStr]),
        runQuery(categoryCostQuery, [UID])
    ]).then(results => {
        const [monthlyCost, weeklyCost, recentCost, categoryCost] = results;

        const categoryCostMap = {};
        categoryCost.forEach(category => {
            categoryCostMap[category.category] = category.total_cost;
        });

        const responseData = {
            monthlyCost,
            weeklyCost: [0, 0, 0, 0], // Initialize all weeks with 0
            recentCost: [],
            categoryCost: {}
        };

        desiredOrder.forEach(category => {
            responseData.categoryCost[category] = categoryCostMap[category] || 0;
        });

        const recentDates = [];
        const currentDate = new Date(zonedEndDate);
        for (let i = 0; i < 7; i++) {
            recentDates.unshift(currentDate.toISOString().slice(0, 10));
            currentDate.setDate(currentDate.getDate() - 1);
        }

        const recentCostMap = {};
        recentDates.forEach(date => {
            recentCostMap[date] = 0;
        });

        recentCost.forEach(item => {
            recentCostMap[item.date] = item.total_cost;
        });

        recentDates.forEach(date => {
            responseData.recentCost.push({
                date: date,
                total_cost: recentCostMap[date]
            });
        });

        weeklyCost.forEach(item => {
            responseData.weeklyCost[item.week - 1] = item.total_cost;
        });

        console.log(responseData);
        res.json(responseData);
    }).catch(err => {
        console.error('쿼리를 실행하는데 오류가 발생했습니다.', err);
        res.status(500).json({ error: '쿼리 실행 오류' });
    });
});

app.get('/calendar/get', (req, res) => {
    console.log(req.query);
    const { UID, day } = req.query;

    const getExpenseQuery = `
        SELECT *
        FROM books
        WHERE UID = ? AND DATE(date) = STR_TO_DATE(?, '%Y-%m-%d')
    `;

    runQuery(getExpenseQuery, [UID, day])
        .then(results => {
            res.status(200).json(results);
            console.log(results);
        })
        .catch(err => {
            console.error('Error fetching expense data:', err);
            res.status(500).json({ error: 'Failed to fetch expense data.' });
        });
});

app.post('/calendar/post', (req, res) => {
    console.log(req.body);
    const { UID, date, time, detail, cost, category } = req.body;
    const datetime = new Date(date + ' ' + time);

    const addExpenseQuery = `
        INSERT INTO books (UID, date, detail, cost, category)
        VALUES (?, ?, ?, ?, ?)
    `;

    runQuery(addExpenseQuery, [UID, datetime, detail, cost, category])
        .then(() => {
            res.status(200).json({ message: 'Expense added successfully.' });
        })
        .catch(err => {
            console.error('Error adding expense:', err);
            res.status(500).json({ error: 'Failed to add expense.' });
        });
});

app.delete('/calendar/delete', (req, res) => {
    const { HID, UID } = req.body;

    // Query to delete the expense data from the 'books' table
    const deleteExpenseQuery = `
        DELETE FROM books
        WHERE HID = ? AND UID = ?
    `;

    runQuery(deleteExpenseQuery, [HID, UID])
        .then(() => {
            res.status(200).json({ message: 'Expense deleted successfully.' });
        })
        .catch(err => {
            console.error('Error deleting expense:', err);
            res.status(500).json({ error: 'Failed to delete expense.' });
        });
});


function runQuery(query, params) {
    return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
            if (err) {
                console.error('쿼리 실행 중 오류가 발생했습니다:', err);
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

app.listen(PORT, () => console.log("server running..."));

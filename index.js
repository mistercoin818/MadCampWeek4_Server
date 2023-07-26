const express = require('express');
const app = express();

const cors = require("cors");

const PORT = 80;
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const mysql = require('mysql2')
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'week4'
});

// 모든 라우트에 대해 CORS 활성화
app.use(cors({
    origin: 'http://localhost:3000', // Allow requests from this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// MySQL 서버 연결
connection.connect((err) => {
    if (err) {
        console.log(err)
        console.error('MySQL 서버에 접속할 수 없습니다.');
        return;
    }

    console.log('MySQL 서버에 접속되었습니다.');
});

app.get('/dashboard', (req, res) => {
    const { UID } = req.query; // Frontend에서 UID를 query parameter로 보낼 때 사용합니다.

    // 매일 시작일과 종료일을 계산
    const endDate = new Date(); // 오늘 날짜 (기본값)
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6); // 7일 전으로 설정

    // 날짜를 MySQL에서 사용할 수 있는 문자열로 변환
    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);

    // 월별 총 소비량을 계산하는 쿼리
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

    // 이번 달의 1주차부터 4주차까지의 소비량을 계산하는 쿼리
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

    // 이번 달의 1주차부터 4주차까지의 소비량을 계산하는 쿼리
    // const weeklyCostQuery = `
    //     SELECT 
    //         weeks.week_num,
    //         IFNULL(SUM(books.cost), 0) AS total_cost
    //     FROM 
    //         weeks
    //     LEFT JOIN books ON weeks.week_num = WEEK(DATE_FORMAT(books.date, '%Y-%m-%d'), 1)
    //                 AND books.UID = ?
    //                 AND DATE_FORMAT(books.date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
    //     GROUP BY 
    //         weeks.week_num
    //     ORDER BY 
    //         weeks.week_num ASC
    // `;


    // 최근 7일 동안의 소비내역을 가져오는 쿼리
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

    // 이번 달의 category별 소비한 금액을 계산하는 쿼리
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

    // Define the desired order of categories
    const desiredOrder = ["식비", "주거", "교통", "쇼핑", "의료", "여가", "기타"];

    Promise.all([
        runQuery(monthlyCostQuery, [UID]),
        runQuery(weeklyCostQuery, [UID]),
        runQuery(recentCostQuery, [UID, startDateStr, endDateStr]), // 수정된 부분
        runQuery(categoryCostQuery, [UID])
    ]).then(results => {
        const [monthlyCost, weeklyCost, recentCost, categoryCost] = results;

        // Prepare an object to store the category names and their total costs
        const categoryCostMap = {};
        categoryCost.forEach(category => {
            categoryCostMap[category.category] = category.total_cost;
        });

        // Fetch the list of all unique categories from the books table
        const uniqueCategoriesQuery = `
            SELECT DISTINCT category FROM books WHERE UID = ?
        `;
        runQuery(uniqueCategoriesQuery, [UID]).then(uniqueCategories => {
            // Initialize the responseData object with all categories and set their total costs to 0
            const responseData = {
                monthlyCost,
                weeklyCost,
                recentCost: [], // Initialize as an empty array
                categoryCost: {}
            };

            // Populate the responseData.categoryCost object in the desired order
            desiredOrder.forEach(category => {
                responseData.categoryCost[category] = categoryCostMap[category] || 0;
            });

            // Fetch the list of all dates within the recent 7-day period
            const recentDates = [];
            const currentDate = new Date(endDate);
            for (let i = 0; i < 7; i++) {
                recentDates.unshift(currentDate.toISOString().slice(0, 10));
                currentDate.setDate(currentDate.getDate() - 1);
            }

            // Prepare an object to store the recent dates and their total costs
            const recentCostMap = {};
            recentDates.forEach(date => {
                recentCostMap[date] = 0;
            });

            // Populate the recentCostMap with actual data from the database
            recentCost.forEach(item => {
                recentCostMap[item.date] = item.total_cost;
            });

            // Populate the responseData.recentCost array with recent date data
            recentDates.forEach(date => {
                responseData.recentCost.push({
                    date: date,
                    total_cost: recentCostMap[date]
                });
            });

            // 결과를 JSON 형식으로 응답
            res.json(responseData);
        }).catch(err => {
            console.error('쿼리를 실행하는데 오류가 발생했습니다.', err);
            res.status(500).json({ error: '쿼리 실행 오류' });
        });
    }).catch(err => {
        console.error('쿼리를 실행하는데 오류가 발생했습니다.', err);
        res.status(500).json({ error: '쿼리 실행 오류' });
    });
});

app.get('/calendar/get', (req, res) => {
    console.log(req.query);
    const { UID, day } = req.query;

    // Query to fetch the expense data for the given UID and date
    const getExpenseQuery = `
        SELECT *
        FROM books
        WHERE UID = ? AND DATE(date) = STR_TO_DATE(?, '%Y-%m-%d')
    `;

    runQuery(getExpenseQuery, [UID, day])
        .then(results => {
            res.status(200).json(results);
            console.log(results)
        })
        .catch(err => {
            console.error('Error fetching expense data:', err);
            res.status(500).json({ error: 'Failed to fetch expense data.' });
        });
});


app.post('/calendar/post', (req, res) => {
    console.log(req.body);
    const { UID, date, time, detail, cost, category } = req.body;

    // Combine date and time to create a single datetime value
    const datetime = new Date(date + ' ' + time);

    // Insert the new expense into the 'books' table
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


// 쿼리 실행 함수
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

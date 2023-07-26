const express = require('express');
const app = express();

const cors = require("cors");

const PORT = 80;

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

// app.get('/', function(req, res){
//     res.send('Hello World!');
// })

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

    // 현재 달의 1, 2, 3, 4주차의 소비량을 계산하는 쿼리
    const weeklyCostQuery = `
        SELECT 
            WEEK(date) AS week,
            SUM(cost) AS total_cost
        FROM 
            books
        WHERE 
            UID = ? AND
            DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        GROUP BY 
            WEEK(date)
        ORDER BY 
            WEEK(date) ASC
    `;


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
            DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        GROUP BY 
            category
    `;

    // 각 쿼리를 병렬로 실행하고 결과를 배열에 저장
    Promise.all([
        runQuery(monthlyCostQuery, [UID]),
        runQuery(weeklyCostQuery, [UID, startDateStr, endDateStr]),
        runQuery(recentCostQuery, [UID]),
        runQuery(categoryCostQuery, [UID])
    ]).then(results => {
        const [monthlyCost, weeklyCost, recentCost, categoryCost] = results;
        const responseData = {
            monthlyCost,
            weeklyCost,
            recentCost,
            categoryCost
        };
        
        console.log(weeklyCost);
        console.log(recentCost);
        console.log(categoryCost);


        // 결과를 JSON 형식으로 응답
        res.json(responseData);
    }).catch(err => {
        console.error('쿼리를 실행하는데 오류가 발생했습니다.');
        console.log(endDateStr);
        res.status(500).json({ error: '쿼리 실행 오류' });
    });
});

// 쿼리 실행 함수
function runQuery(query, params) {
    return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}



app.listen(PORT, ()=> console.log("server running..."));
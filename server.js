const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');  // 引入 cors 中间件

// 连接 MongoDB 数据库
mongoose.connect('mongodb://localhost:27017/address_db')
  .then(() => {
    console.log('MongoDB连接成功');
  })
  .catch((err) => {
    console.error('MongoDB连接失败:', err);
  });

// 定义数据模型
const submissionSchema = new mongoose.Schema({
  address: String,
  name: String,
  phone: String,
  remark: String,
  createdAt: { type: Date, default: Date.now },
  isUpdated: { type: Boolean, default: false }  // 新增字段：标识是否是已更新订单
});

const Submission = mongoose.model('Submission', submissionSchema);

const app = express();
app.use(bodyParser.json());

// 使用 CORS 中间件，允许任何来源的跨域请求
app.use(cors());  // 这一行允许任何来源的请求

// 提交用户信息的 API
app.post('/submit', async (req, res) => {
  const { address, name, phone, remark } = req.body;

  // 获取当前日期（不包括时间部分）
  const currentDate = new Date();
  const formattedDate = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // 查找是否有同一天、相同手机号的订单
    const existingSubmission = await Submission.findOne({
      phone,
      createdAt: { $gte: new Date(`${formattedDate}T00:00:00`), $lt: new Date(`${formattedDate}T23:59:59`) }
    });

    if (existingSubmission) {
      // 如果存在，更新现有订单并标记为已更新
      existingSubmission.address = address;
      existingSubmission.name = name;
      existingSubmission.remark = remark;
      existingSubmission.createdAt = new Date();  // 更新时间戳
      existingSubmission.isUpdated = true;  // 标记为已更新

      await existingSubmission.save();
      res.status(200).json({ message: '订单已更新', isUpdated: true });
    } else {
      // 如果不存在，创建新的订单
      const submission = new Submission({ address, name, phone, remark });
      await submission.save();
      res.status(200).json({ message: '提交成功', isUpdated: false });
    }
  } catch (err) {
    res.status(500).json({ message: '提交失败', error: err });
  }
});

// 获取所有提交信息的 API，按日期分组，并按时间倒序排列
app.get('/submissions', async (req, res) => {
  try {
    // 获取所有提交记录，并按日期进行分组，同时每个日期组内按提交时间倒序排列
    const submissions = await Submission.aggregate([
      {
        $project: {
          address: 1,
          name: 1,
          phone: 1,
          remark: 1,
          createdAt: 1,
          isUpdated: 1,  // 包含isUpdated字段
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } // 格式化日期，按天分组
        }
      },
      { $group: { _id: "$date", list: { $push: "$$ROOT" } } }, // 按日期分组，并将订单放入 list 数组
      { $sort: { _id: -1 } }, // 按日期倒序排列
      {
        $project: {
          date: "$_id", // 将 _id 改为 date 字段
          list: { $reverseArray: "$list" } // 每个日期组内按时间倒序排列
        }
      }
    ]);

    // 发送响应数据
    res.status(200).json({
      code: 200,
      message: '请求成功',
      data: { submissions }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取数据失败', error: err });
  }
});

// 删除订单接口
app.delete('/delete-order/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 使用正确的模型：Submission
    const result = await Submission.findByIdAndDelete(id); // 根据订单 ID 删除
    if (result) {
      res.status(200).json({ code: 200, message: '订单删除成功' });
    } else {
      res.status(404).json({ code: 201, message: '未找到该订单' });
    }
  } catch (error) {
    res.status(500).json({ code: 202, message: '删除订单失败', error });
  }
});

// 启动服务器
app.listen(3000, () => {
  console.log('服务器已启动，监听端口 3000');
});

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');  // 引入 cors 中间件

// 连接 MongoDB 数据库
mongoose.connect('mongodb://127.0.0.1:27017/test')
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
  isUpdated: { type: Boolean, default: false },  // 新增字段：标识是否是已更新订单
	amount: String // 新增字段：订单金额
});

const Submission = mongoose.model('Submission', submissionSchema);

const app = express();
app.use(bodyParser.json());

// 使用 CORS 中间件，允许任何来源的跨域请求
app.use(cors());  // 这一行允许任何来源的请求

// 提交用户信息的 API
app.post('/submit', async (req, res) => {
  const { address, name, phone, remark, amount } = req.body;

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
			existingSubmission.amount = amount; // 更新金额

      await existingSubmission.save();
      res.status(200).json({ message: '订单已更新', isUpdated: true });
    } else {
      // 如果不存在，创建新的订单
      const submission = new Submission({ address, name, phone, remark, amount });
      await submission.save();
      res.status(200).json({ message: '提交成功', isUpdated: false });
    }
  } catch (err) {
    res.status(500).json({ message: '提交失败', error: err });
  }
});

// 修改订单接口
app.put('/update-order/:id', async (req, res) => {
  const { id } = req.params; // 获取订单ID
  const { address, name, phone, remark, amount } = req.body; // 获取需要更新的字段

  try {
    // 查找订单并更新字段
    const updatedOrder = await Submission.findByIdAndUpdate(
      id, 
      { 
        address, 
        name, 
        phone, 
        remark, 
        isUpdated: true, // 标记为已更新
        createdAt: new Date(), // 更新时间戳
        amount
      },
      { new: true } // 返回更新后的数据
    );

    if (updatedOrder) {
      res.status(200).json({ code: 200, message: '订单更新成功', data: updatedOrder });
    } else {
      res.status(404).json({ code: 201, message: '未找到该订单' });
    }
  } catch (error) {
    res.status(500).json({ code: 202, message: '更新订单失败', error });
  }
});


// 获取所有提交信息的 API，按日期分组，并按时间倒序排列 支持按日期分组的分页
app.get('/submissions', async (req, res) => {
  const { page = 1, limit = 10 } = req.query; // 从请求参数中获取分页参数，默认第一页，每页10条

  try {
    const submissions = await Submission.aggregate([
      {
        $project: {
          address: 1,
          name: 1,
          phone: 1,
          remark: 1,
          createdAt: 1,
          isUpdated: 1, // 包含isUpdated字段
          amount: 1, // 包含金额字段
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } // 格式化日期，按天分组
        }
      },
      { $group: { _id: "$date", list: { $push: "$$ROOT" } } }, // 按日期分组，并将订单放入 list 数组
      { $sort: { _id: -1 } } // 按日期倒序排列
    ]);

    // 将所有数据线性展平并记录分组索引
    const flattened = [];
    submissions.forEach((group) => {
      group.list.forEach((item) => {
        flattened.push({ ...item, groupDate: group._id });
      });
    });

    // 实现分页逻辑
    const startIndex = (page - 1) * limit; // 当前页起始索引
    const endIndex = startIndex + parseInt(limit); // 当前页结束索引
    const pageData = flattened.slice(startIndex, endIndex);

    // 将数据重新按日期分组
    const groupedData = {};
    pageData.forEach((item) => {
      if (!groupedData[item.groupDate]) {
        groupedData[item.groupDate] = [];
      }
      groupedData[item.groupDate].push(item);
    });

    // 格式化返回结果
    const formattedSubmissions = Object.entries(groupedData).map(([date, list]) => ({
      date,
      list: list.reverse(), // 每组内按时间倒序排列
    }));

    // 查询总记录数和计算总页数
    const totalRecords = flattened.length;
    const totalPages = Math.ceil(totalRecords / limit);

    // 返回分页数据
    res.status(200).json({
      code: 200,
      message: '请求成功',
      data: {
        submissions: formattedSubmissions,
        totalPages,
        currentPage: parseInt(page),
        totalRecords
      }
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

// 定义一个全局变量用来控制页面 UI 的开关状态
let isUIEnabled = false;

// 新增一个接口，用于获取 UI 状态
app.get('/ui-status', (req, res) => {
  res.status(200).json({ code: 200, message: '状态获取成功', data: { isUIEnabled } });
});

// 新增一个接口，用于设置 UI 状态
app.post('/toggle-ui', (req, res) => {
  const { enable } = req.body; // 从请求体中获取开关状态
  if (typeof enable !== 'boolean') {
    return res.status(400).json({ code: 400, message: '参数无效，请传递布尔值' });
  }
  isUIEnabled = enable; // 更新全局变量
  res.status(200).json({ code: 200, message: 'UI 状态更新成功', data: { isUIEnabled } });
});


// 启动服务器
app.listen(3000, () => {
  console.log('服务器已启动，监听端口 3000');
});

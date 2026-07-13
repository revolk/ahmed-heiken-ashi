/**
 * db/connect.js
 * اتصال MongoDB مع إعادة محاولة تلقائية عند الانقطاع (بند 14: الصمود عند تعطل الخادم مؤقتًا).
 */

const mongoose = require('mongoose');

async function connectDB(uri, { onLog } = {}) {
  const log = onLog || console.log;

  mongoose.connection.on('disconnected', () => {
    log('⚠️ انقطع الاتصال بقاعدة البيانات - جاري إعادة المحاولة...');
  });
  mongoose.connection.on('reconnected', () => {
    log('✅ اتصل بقاعدة البيانات تاني بنجاح');
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: true,
  });

  log('✅ اتصل بقاعدة البيانات بنجاح');
  return mongoose.connection;
}

module.exports = { connectDB };

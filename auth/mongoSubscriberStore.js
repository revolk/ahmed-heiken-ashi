/**
 * auth/mongoSubscriberStore.js
 * التنفيذ الفعلي لواجهة SubscriberStore باستخدام Mongoose.
 */

const Subscriber = require('../models/Subscriber');

const mongoSubscriberStore = {
  async findByTokenHash(tokenHash) {
    // ملحوظة: accessToken معمول عليه select:false في المخطط، فبنطلبه صراحة هنا بس
    return Subscriber.findOne({ accessToken: tokenHash }).select('+accessToken').lean();
  },
  async updateDevices(id, devices) {
    await Subscriber.findByIdAndUpdate(id, { devices });
  },
  async touchLogin(id, date) {
    await Subscriber.findByIdAndUpdate(id, { lastLoginAt: date });
  },
};

module.exports = { mongoSubscriberStore };

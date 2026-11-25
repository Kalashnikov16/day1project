const clients = new Map(); // userId -> Express response object

const sseManager = {
  addClient: (userId, res) => {
    clients.set(userId, res);
  },
  removeClient: (userId) => {
    clients.delete(userId);
  },
  notifyUser: (userId, data) => {
    const clientRes = clients.get(userId);
    if (clientRes) {
      clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  },
};

module.exports = sseManager;

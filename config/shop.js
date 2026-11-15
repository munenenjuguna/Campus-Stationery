// config/shop.js
// Business settings used across the system. Change them here, not inside the code.

module.exports = {
  SHOP_NAME: 'CampusStationery',
  CURRENCY: 'KES',

  // Fee charged when a customer chooses Campus Delivery instead of pickup
  DELIVERY_FEE: 100,

  // Products at or below this stock level show as "low stock" on the dashboard and reports
  LOW_STOCK_LEVEL: 10,

  // Limits that protect the order form from silly or malicious input
  MAX_ITEMS_PER_ORDER: 50,
  MAX_QUANTITY_PER_ITEM: 99,

  DELIVERY_METHODS: ['Campus Pickup', 'Campus Delivery'],
  PAYMENT_METHODS: ['M-Pesa', 'Cash on Collection'],

  // Order life cycle. Each status lists the statuses it is allowed to move to next.
  ORDER_FLOW: {
    'Pending': ['Processing', 'Cancelled'],
    'Processing': ['Ready for Collection', 'Cancelled'],
    'Ready for Collection': ['Completed', 'Cancelled'],
    'Completed': [],
    'Cancelled': []
  },

  // Login protection
  MAX_FAILED_LOGINS: 5,
  LOCK_MINUTES: 5,

  // Password reset links stay valid for this many minutes
  RESET_LINK_MINUTES: 30
};

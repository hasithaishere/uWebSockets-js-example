const jwt = require('jsonwebtoken');

// JWT secret key (should match your server's secret)
const JWT_SECRET = 'your-jwt-secret-key';

// Sample user data
const user = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User'
};

// Generate token
const token = jwt.sign(user, JWT_SECRET, {
  expiresIn: '24h' // Token expires in 24 hours 
});

console.log('Generated Token:');
console.log(token);

// Verify token (optional, for testing)
try {
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log('\nDecoded Token Data:');
  console.log(decoded);
} catch (error) {
  console.error('Token verification failed:', error.message);
}
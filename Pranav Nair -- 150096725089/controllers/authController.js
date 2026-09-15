'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../utils/fileHelper');

const USERS_FILE = 'users.json';
const SALT_ROUNDS = 10;

/** Strip the password hash before returning a user to the client. */
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 * 201 on success; 400 on missing fields or duplicate email.
 */
async function register(req, res, next) {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'username, email and password are required',
      });
    }

    const users = await readData(USERS_FILE);
    const emailLower = String(email).toLowerCase();

    if (users.some((u) => u.email.toLowerCase() === emailLower)) {
      return res.status(400).json({
        success: false,
        message: 'A user with that email already exists',
      });
    }

    const hash = await bcrypt.hash(String(password), SALT_ROUNDS);
    const newUser = {
      id: 'usr_' + uuidv4().slice(0, 8),
      username,
      email,
      password: hash,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await writeData(USERS_FILE, users);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: publicUser(newUser),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Sets req.session.user on success; 200. 401 on bad credentials.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const users = await readData(USERS_FILE);
    const emailLower = String(email).toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === emailLower);

    // Same generic response whether user missing or password wrong.
    const ok = user ? await bcrypt.compare(String(password), user.password) : false;
    if (!ok) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Destroys the session; 200.
 */
async function logout(req, res, next) {
  try {
    if (!req.session) {
      return res.status(200).json({ success: true, message: 'Logged out' });
    }
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      return res.status(200).json({ success: true, message: 'Logged out' });
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout };

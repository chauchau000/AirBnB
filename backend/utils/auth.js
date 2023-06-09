const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../config');
const { User, Spot, Review, Booking } = require('../db/models');

const { secret, expiresIn } = jwtConfig;

const setTokenCookie = (res, user) => {
  // Create the token.
  const safeUser = {
    id: user.id,
    email: user.email,
    username: user.username,
  };
  const token = jwt.sign(
    { data: safeUser },
    secret,
    { expiresIn: parseInt(expiresIn) } // 604,800 seconds = 1 week
  );

  const isProduction = process.env.NODE_ENV === "production";

  // Set the token cookie
  res.cookie('token', token, {
    maxAge: expiresIn * 1000, // maxAge in milliseconds
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction && "Lax"
  });

  return token;
};

const restoreUser = (req, res, next) => {
  // token parsed from cookies
  const { token } = req.cookies;
  req.user = null;

  return jwt.verify(token, secret, null, async (err, jwtPayload) => {
    if (err) {
      return next();
    }

    try {
      const { id } = jwtPayload.data;
      req.user = await User.findByPk(id, {
        attributes: {
          include: ['email', 'createdAt', 'updatedAt']
        }
      });
    } catch (e) {
      res.clearCookie('token');
      return next();
    }

    if (!req.user) res.clearCookie('token');

    return next();
  });
};


const requireAuth = function (req, _res, next) {
  if (req.user) return next();

  const err = new Error('Authentication required');
  err.title = 'Authentication required';
  err.errors = { message: 'Authentication required' };
  err.status = 401;
  return next(err);
}

const forbidden = function (res) {
  res.statusCode = 403;
  res.json({
    message: "Forbidden"
  })
};

// const forbidden = function (_req, _res, next) {
//   const err = new Error("Forbidden");
//   err.status = 403;
//   return next(err);
// };

const notFound = function (res, item) {
  res.statusCode = 404;
  res.json({
    message: `${item} couldn't be found`
  });
}

const spotNotFound = async function (req, res, next) {
  const spotId = req.params.spotId;
  const spot = await Spot.findByPk(spotId);

  if (!spot) {
    const err = new Error('Spot not found');
    err.message = "Spot couldn't be found";
    err.status = 404;
    return next(err);
  }
  next();
}



const spotAuth = async function ( req, res, next ) {
  //* Require proper authorization: Spot must NOT belong to the current user
  const spotId = req.params.spotId;
  const spot = await Spot.findByPk(spotId);

  if  (spot.dataValues.ownerId === req.user.id) {
    return forbidden(res);
  } 
  next();
}

const reviewNotFound = async function (req, res, next) {
  const reviewId = req.params.reviewId;

  const review = await Review.findByPk(reviewId);

  if (!review) {
    const err = new Error('Review not found');
    err.message = "Review couldn't be found";
    err.status = 404;
    return next(err);
  } else if (review.userId !== req.user.id) {
    const err = new Error("Forbidden");
    err.status = 403;
    return next(err);
  }
  next()
}


const bookingNotFound = async function (req, res, next) {
  const bookingId = req.params.bookingId;
  const booking = await Booking.findByPk(bookingId);

  if (!booking) {
    const err = new Error('Booking not found');
    err.message = "Booking couldn't be found";
    err.status = 404;
    return next(err);
  }
  next();
}


const bookingAuth = async function ( req, res, next ) {
  //* Require proper authorization: Booking must belong to the current user
  const bookingId = req.params.bookingId;
  const booking = await Booking.findByPk(bookingId);

  if  (booking.userId !== req.user.id) {
    return forbidden(res);
  } 
  next();
}


const bookingConflict = async function (req, res, next) {
  const { startDate, endDate } = req.body;
  const spotId = req.params.spotId;

  const spot = await Spot.findByPk(spotId);

  const existingBookings = await spot.getBookings();

  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentDate = new Date();

  if (startDate <= currentDate) { 
    return res.status(403).json({
        message: "Bookings may not be made for a past date"
    });
}

  for (let i = 0; i < existingBookings.length; i++) {
    let existingBooking = existingBookings[i];
    let existingStart = new Date(existingBooking.dataValues.startDate);
    let existingEnd = new Date(existingBooking.dataValues.endDate);

    //new booking sandwiches old booking
    if (start <= existingStart && end >= existingEnd) {
      const err = Error('Sorry, this spot is already booked for the specified dates');
      err.title = 'Invalid booking'
      err.errors = {
        startDate: "Start date conflicts with an existing booking",
        endDate: "End date conflicts with an existing booking"
      }
      err.status = 403;
      return next(err);
    
    //old booking sandwiches new booking
    //start date is equal two or inbetween existing booked dates 
    //AND end date is equal to or inbetween existing booked dates
    } else if ((start >= existingStart && start <= existingEnd) && (end >= existingStart && end <= existingEnd)) {
      const err = Error('Sorry, this spot is already booked for the specified dates');
      err.title = 'Invalid booking'
      err.errors = {
        startDate: "Start date conflicts with an existing booking",
        endDate: "End date conflicts with an existing booking"
      }
      err.status = 403;
      return next(err);
    
    //start date is equal to or inbetween existing booked dates
    } else if (start >= existingStart && start <= existingEnd) {
      const err = Error('Sorry, this spot is already booked for the specified dates');
      err.title = 'Invalid booking'
      err.errors = {
        startDate: "Start date conflicts with an existing booking",
      }
      err.status = 403;
      return next(err);
    
      //end date is equal to or inbetween existing booked dates
    } else if (end >= existingStart && end <= existingEnd) {
      const err = Error('Sorry, this spot is already booked for the specified dates');
      err.title = 'Invalid booking'
      err.errors = {
        endDate: "End date conflicts with an existing booking"
      }
      err.status = 403;
      return next(err);
    }
  }
  next();
}

module.exports = { setTokenCookie, restoreUser, requireAuth, forbidden, notFound, spotNotFound, reviewNotFound, bookingConflict, spotAuth, bookingNotFound, bookingAuth};

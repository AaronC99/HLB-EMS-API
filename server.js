var cors = require("cors");

var corsOptions = {
    origin: process.env.UI_URL,
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
  }

var express = require('express'),
  app = express(),
  port = process.env.PORT || 3000,
  mongoose = require('mongoose'),
  Employee = require('./api/models/employeeModel'),
  Department = require('./api/models/departmentModel'),
  Schedule = require('./api/models/scheduleModel'),
  Timesheet = require('./api/models/timesheetModel'),
  Period = require('./api/models/periodModel'),
  TimesheetApproval = require('./api/models/timesheetApprovalModel'),
  LastClockIn = require('./api/models/lastClockInModel'),
  Holiday = require('./api/models/holidayModel'),
  LeaveApproval = require('./api/models/leaveApprovalModel'),
  Notification = require('./api/models/notificationModel'),
  bodyParser = require("body-parser");

mongoose.Promise=global.Promise;
mongoose.connect(process.env.DATABASE_URL).catch(err => {
  console.log(err);
});
mongoose.set('useFindAndModify', false);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));
app.use(cors(corsOptions));

var routes = require('./api/routes/emsRoute');
routes(app);

app.listen(port);

console.log('EMS RESTful API server started on: ' + port);
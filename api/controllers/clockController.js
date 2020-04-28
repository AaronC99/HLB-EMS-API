var mongoose = require('mongoose');
var Period = mongoose.model('period');
var Timesheet = mongoose.model('timesheet');
var Employee = mongoose.model('employee');
var TimesheetApproval = mongoose.model('timesheet_approval');

async function createPeriods(year,res){

    await Period.findOne({"year":year}, function(err, period){
        if(err){
            res.status(500);
            res.send('There is a problem with the record');
        }

        if(!period){
            for(var i = 0; i<12;i++){
                let d = new Date(year, i + 1, 0,+8);
                let date = ("0" + d.getDate()).slice(-2);
                let month = ("0" + (d.getMonth() + 1)).slice(-2);
        
                const periodObj = {
                    "period_number" : i.toString(),
                    "date_start" : "01-"+month,
                    "date_end" : date+'-'+month,
                    "year" : year.toString()
                }
                
                const new_period = new Period(periodObj);
                new_period.save(function(err){
                    if(err){
                        res.status(500);
                        res.send('There is a problem with the record');
                    }
                });
            }
        }
    });
};

async function createTimesheet(domainID, periodNumber, year) {

    // Check if there is a plotted timesheet for specified user and period.
    const timesheet = await Timesheet.findOne({"domain_id" : domainID, "period_number": periodNumber, "year": year});

    // If no timesheet, generate a timesheet in DB.
    if (!timesheet) {

        const period = await Period.findOne({"period_number": periodNumber, "year": year});

        if(period) {

            const startDate = Number(period.date_start.substr(0, 2));
            const endDate = Number(period.date_end.substr(0, 2));

            const new_timesheet = [];

            for(var i = startDate; i <= endDate ; i++){
                let dateIn = ("0"+ i).slice(-2)+"-"+("0"+(Number(periodNumber)+1)).slice(-2);
                let d = new Date(Number(year), Number(periodNumber), i,+8);
                let day = null;

                if(d.getDay() === 0 || d.getDay() === 6){
                    day = "Weekend";
                }

                const timesheetObj = {
                    "domain_id":domainID,
                    "date_in":dateIn,
                    "time_in":"0000",
                    "time_out":"0000",
                    "date_out":null,
                    "period_number": periodNumber,
                    "year": year,
                    "ot":0,
                    "ut":0,
                    "late":0,
                    "remarks":day
                };

                new_timesheet.push(new Timesheet(timesheetObj));
            }

            return new_timesheet;
        }
    }

    return [];
};

async function createTimesheetApproval(period,year,domainID){
    const employee = await Employee.findOne({domain_id: domainID})
        .populate({path: "department", populate: {path:"department_head", select:"domain_id"}});

    let ApprovalStatus = "Pending";
    if(domainID===employee.department.department_head.domain_id){
        ApprovalStatus = "Approved";
    }
    const timesheetapproval = await TimesheetApproval.findOne({employee_id: domainID, period_number: period, year: year});

    if(!timesheetapproval){
        const timesheetApprovalObj = {
            "period_number":period,
            "year":year,
            "approval_status":ApprovalStatus,
            "date_submitted":null,
            "employee_id": domainID,
            "manager_id": employee.department.department_head.domain_id
        }
        const new_timesheetApproval = new TimesheetApproval(timesheetApprovalObj);
        new_timesheetApproval.save();
    }
}

async function clockIn(domainID, dateIn, timeIn, year){
    return await Timesheet.findOneAndUpdate({"domain_id": domainID, "date_in": dateIn, "year":year},{"time_in":timeIn},{new:true});
}

async function calcLateHrs(domainID, dateIn, timeIn, year){
    const employee = await Employee.findOne({domain_id:domainID})
        .populate("schedule","-_id");

    const startTime = employee.schedule.start_time;
    const lateHrs = ((Number(timeIn.substr(0,2))*60 + Number(timeIn.substr(2,2))) - (Number(startTime.substr(0,2))*60 + Number(startTime.substr(2,2))))/60;
    if(lateHrs > 0){
        return await Timesheet.findOneAndUpdate({"domain_id": domainID, "date_in": dateIn, "year":year},{"late":lateHrs},{new:true});
    }
}

exports.clockIn = async function(req,res){
    const body = req.body;

    const domainID = body.domain_id;
    const dateIn = body.date_in;
    const timeIn = body.time_in;
    const year = body.year;
    const period = (Number(dateIn.substr(3,2))-1).toString();

    const resolvePeriod = await createPeriods(year,res);
    await createTimesheet(domainID,period,year).then( async (doc) => {

        if(doc.length) {
            doc.map( doc => {
                if(doc.date_in === dateIn) {
                    doc.time_in = timeIn;
                }
    
                return doc;
            });

            await Timesheet.insertMany(doc);
            await createTimesheetApproval(period, year, domainID);
        } else {
            await clockIn(domainID,dateIn, timeIn, year);
        }
        await calcLateHrs(domainID, dateIn, timeIn, year);
        
        const clockedInTimesheet = await Timesheet.find({"domain_id": domainID, "period_number": period, "year":year});
        res.json(clockedInTimesheet);
    });  
};

async function calcOTnUT(domainID, dateIn, dateOut, timeOut, year){
    const employee = await Employee.findOne({domain_id:domainID})
        .populate("schedule","-_id");

    const startTime = employee.schedule.start_time;
    const endTime = employee.schedule.end_time;
    const workingHours = (Number(endTime.substr(0,2))*60 + Number(endTime.substr(2,2))) - (Number(startTime.substr(0,2))*60 + Number(startTime.substr(2,2)));
    
    const timesheet = await Timesheet.findOne({"domain_id": domainID, "date_in": dateIn, "year":year});
    const timeIn = timesheet.time_in;
    
    const d1 = new Date(Number(year), (Number(dateIn.substr(3,2))-1), Number(dateIn.substr(0,2)),(Number(timeIn.substr(0,2)))+8, Number(timeIn.substr(2,2)));
    const d2 = new Date(Number(year), (Number(dateOut.substr(3,2))-1), Number(dateOut.substr(0,2)),(Number(timeOut.substr(0,2)))+8, Number(timeOut.substr(2,2)));

    const workedHours = Math.abs(d2 - d1) / (60*1000);
    
    const diffHrs = (workedHours - workingHours) / 60;
    
    if(diffHrs > 0){
        return await Timesheet.findOneAndUpdate({"domain_id": domainID, "date_in": dateIn, "year":year}, {"ot": diffHrs, "ut":0}, {new:true});
    }else{
        return await Timesheet.findOneAndUpdate({"domain_id": domainID, "date_in": dateIn, "year":year}, {"ot": 0, "ut": diffHrs*-1}, {new:true});
    }
}

async function clockOut(domainID, dateIn, dateOut, timeOut, year){
    let updatedDateOut = null;
    if(dateIn !== dateOut){
        updatedDateOut = dateOut;
    }
    return await Timesheet.findOneAndUpdate({"domain_id": domainID, "date_in": dateIn, "year":year},{"time_out":timeOut, "date_out": updatedDateOut},{new:true});
}

exports.clockOut = async function(req, res){
    const body = req.body;

    const domainID = body.domain_id;
    const dateIn = body.date_in;
    const dateOut = body.date_out;
    const timeOut = body.time_out;
    const year = body.year;
    const period = (Number(dateIn.substr(3,2))-1).toString();

    await clockOut(domainID, dateIn, dateOut, timeOut, year);
    await calcOTnUT(domainID, dateIn, dateOut, timeOut, year);
    const clockedOutTimesheet = await Timesheet.find({"domain_id": domainID, "period_number": period, "year":year});

    res.json(clockedOutTimesheet);
};
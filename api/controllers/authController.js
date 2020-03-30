var mongoose = require('mongoose');
var Employee = mongoose.model('employee');

exports.getLoginDetails = async function(req,res){
    const LoginID = req.params.id;
    const pwd = req.params.pass;

    await Employee.findOne({domain_id : LoginID, password : pwd, activated: true }, 'role -_id' , function(err, employee){
        if(err)
            res.send(err);
        res.json(employee);
    });

};
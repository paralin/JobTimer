var request = require('request');
var createdby = "job-timer";

function index(obj,i) {return obj[i]}

process.on('SIGTERM', function () {
  process.exit(0);
});

var settings = {
  id: process.env.JOBTIMER_JOB_ID || "",
  endpoint: process.env.JOBTIMER_ENDPOINT || "",
  subkey: process.env.JOBTIMER_SUBKEY || "",
  callback: process.env.JOBTIMER_CALLBACK || "",
  callback_method: process.env.JOBTIMER_CALLBACK_METHOD || "GET",
  callback_data: JSON.parse(process.env.JOBTIMER_CALLBACK_DATA || "null"),
  callback_data_type: process.env.JOBTIMER_CALLBACK_DATA_CONTENT_TYPE || "application/json",
  timestamp_type: parseInt(process.env.JOBTIMER_TIMESTAMP_TYPE || 0),
  initial_expire_time: parseInt(process.env.JOBTIMER_INITIAL_EXPIRE_TIME || 0)
};

var wait_until = 0;
function check_once() {
  // Check the endpoint
  request.get(settings.endpoint, function(err, response, body) {
    if (err) {
      console.log("Error GET " + settings.endpoint + ", " + JSON.stringify(err));
      return process.exit(1);
    }

    // Parse
    var r_obj = JSON.parse(body);

    // Check the subkey
    var val = settings.subkey.split('.').reduce(index, r_obj);
    if (!val) {
      console.log("Subkey " + settings.subkey + " is undefined...");
      process.exit(1);
    }

    // Expected value
    if (settings.timestamp_type == 0) {
      wait_until = val * 1000;
    } else {
      console.log("Unknown JOBTIMER_TIMESTAMP_TYPE " + settings.timestamp_type);
      process.exit(1);
    }

    var now = Date.now();
    if (now > val) {
      console.log("Past expiry time of " + val + ", calling callback.");
      console.log(settings.callback_method + " " + settings.callback);
      var req = {uri: settings.callback, method: settings.callback_method};
      if (settings.callback_method === "POST" && settings.callback_data) {
        req.headers = {"content-type": settings.callback_data_type};
        req.body = settings.callback_data;
      }
      request(req, function(err, response, body) {
        if (err) {
          console.log("Error making callback,  " + JSON.stringify(err));
          process.exit(1);
        }
        console.log("Callback complete.");
        process.exit(0);
      });
    } else {
      console.log("New expiry time: " + val + " which is " + ((val - now) / 1000) + " seconds from now.");
      setTimeout(function() {
        check_once();
      }, val - now);
    }
  });
}
var now = Date.now();
if (settings.initial_expire_time && settings.initial_expire_time > now) {
  console.log("Waiting until " + settings.initial_expire_time);
  setTimeout(function() {
    check_once();
  }, val - now);
} else
  check_once();

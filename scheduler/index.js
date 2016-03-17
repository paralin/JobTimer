var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var createdby = "job-timer";

String.prototype.hashCode = function(){
    var hash = 0;
    if (this.length == 0) return hash;
    for (i = 0; i < this.length; i++) {
        char = this.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash;
    }
    return hash;
}


var client_data = {
  endpoint: process.env.KUBE_ENDPOINT || "https://kubernetes.default",
  token: process.env.KUBE_TOKEN || fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8")
};
var client_auth = {"Authorization": "Bearer " + client_data.token};
var r = request.defaults({'headers': client_auth, "strictSSL": false});
var namespace = process.env.KUBE_NAMESPACE;
if (!namespace) {
  console.log("Error, must specify KUBE_NAMESPACE.");
  process.exit(1);
}

var ndp = client_data.endpoint;
var extp = "/apis/extensions/v1beta1/";
var jobs_url = ndp + extp + "namespaces/" + namespace + "/" + "jobs";

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var token = process.env.SCHEDULER_TOKEN || null;
var port = process.env.PORT || 8080;

// Endpoint to schedule a job with an ID
// POST /job/create
// body:
//   {
//      token: If required, SCHEDULER_TOKEN
//      id: ID the system should use for this. If duplicate will reject the call.
//      endpoint: Endpoint the system should GET to get current status
//      subkey: Subkey to check for end time, e.g. "payload.voting.expiry_vote_time"
//      callback: Callback URL to call when the timer is complete
//      callback_method: Callback method to use, default GET
//      callback_data: Callback data to use, default none, valid only for POST,
//      callback_content_type: Callback content type to use, default none, valid only for POST
//      initial_expire_time: Initial expire time.
//   }
// returns: 201 created or 503 error, or 208 already exists
app.post("/job/create", function(req, res) {
  // Check token
  if (!req.body) return res.status(503).json({"error": "No body given."});
  if (token && (!req.body.token || req.body.token != token))
    return res.status(503).json({"error": "No token given."});

  // Check ID
  if (!req.body.id || req.body.id.length < 3)
    return res.status(503).json({"error": "No ID given."});
  if (!req.body.endpoint || !req.body.subkey || !req.body.callback || !req.body.callback_method)
    return res.status(503).json({"error": "Missing required parameter."})

  // Check if it exists already
  r.get(jobs_url, function(err, resp, body) {
    if (err) return res.status(resp.statusCode).json(err);
    var items = JSON.parse(body)["items"];
    for (var itemx in items) {
      var item = items[itemx];
      if (item["metadata"]["labels"]["created-by"] !== createdby) continue;
      if (item["metadata"]["annotations"]["job-timer/id"] === req.body.id)
        return res.status(208).json({"error": "ID " + req.body.id + " already exists."});
    }
    // It doesn't, create it
    var jname = "job-timer-" + (""+req.body.id.hashCode()).replace(/\W/g, '');
    var njob = {
      metadata: {
        "name": jname,
        "namespace": namespace,
        "labels": {
          "app": jname,
          "tier": "job",
          "created-by": createdby
        },
        "annotations": {
          "job-timer/id": req.body.id
        }
      },
      spec: {
        "completions": 1,
        "template": {
          "metadata": {
            "name": jname,
            "labels": {
              "app": jname,
              "tier": "job",
              "created-by": createdby
            },
            "annotations": {
              "job-timer/id": req.body.id
            }
          },
          spec: {
            "containers": [{
              "name": "job-timer",
              "image": "paralin/job-timer:latest",
              "env": [
                {
                  "name": "JOBTIMER_JOB_ID",
                  "value": "" + req.body.id
                },
                {
                  "name": "JOBTIMER_ENDPOINT",
                  "value": "" + req.body.endpoint
                },
                {
                  "name": "JOBTIMER_SUBKEY",
                  "value": "" + req.body.subkey
                },
                {
                  "name": "JOBTIMER_CALLBACK",
                  "value": "" + req.body.callback
                },
                {
                  "name": "JOBTIMER_CALLBACK_METHOD",
                  "value": "" + req.body.callback_method
                },
                {
                  "name": "JOBTIMER_CALLBACK_DATA",
                  "value": JSON.stringify(req.body.callback_data)
                },
                {
                  "name": "JOBTIMER_CALLBACK_DATA_CONTENT_TYPE",
                  "value": req.body.callback_content_type || "application/json"
                },
                {
                  "name": "JOBTIMER_INITIAL_EXPIRE_TIME",
                  "value": (req.body.initial_expire_time || 0) + ""
                }
              ],
              "imagePullPolicy": "Always"
            }],
            // "restartPolicy": "Always" consider never
            "restartPolicy": "OnFailure"
          }
        }
      }
    };
    console.log("POST -> " + jobs_url + " body: " + JSON.stringify(njob));
    r({uri: jobs_url, method: "POST", json: njob}, function(err, resp, body) {
      if (err) return res.status(resp.statusCode).json(err);
      console.log("created job " + req.body.id);
      res.status(201).json({});
    });
  });
});

// Endpoint to cancel a job with an ID
// POST /job/cancel
// body:
//   {
//      token: If required, SCHEDULER_TOKEN
//      id: ID the system should use for this.
//   }
// returns: 200 or 404
app.post("/job/cancel", function(req, res) {
  // Check token
  if (!req.body) return res.status(503).json({"error": "No body given."});
  if (token && (!req.body.token || req.body.token != token))
    return res.status(503).json({"error": "No token given."});

  // Check ID
  if (!req.body.id || req.body.id.length < 3)
    return res.status(503).json({"error": "No ID given."});

  // Check if it exists already
  r.get(jobs_url, function(err, resp, body) {
    if (err) return res.status(resp.statusCode).json(err);
    var items = JSON.parse(body)["items"];
    for (var itemx in items) {
      var item = items[itemx];
      console.log(item);
      if (item["metadata"]["labels"]["created-by"] !== createdby) continue;
      if (item["metadata"]["annotations"]["job-timer/id"] === req.body.id) {
        console.log("canceling job " + req.body.id);
        r.del(jobs_url + "/" + item["metadata"]["name"], function(err, resp, body) {
          if (err) return res.status(resp.statusCode).json(err);
          console.log("canceled job " + req.body.id);
          res.status(200).json({});
        });
        return;
      }
    }
    console.log("cancel request for not-found job " + req.body.id);
    res.status(404).json({"error": "not found"});
    return;
  });
});

app.listen(port, function() {
  console.log("listening on port " + port);
});

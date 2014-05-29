var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
// Retrieve
var MongoClient = require('mongodb').Db;
var app = express();
var teamCodes = ['oak', 'bos', 'det', 'tex'];
var config;

// Connect to the db
MongoClient.connect("mongodb://localhost:27017/bullpen-status", function(err, config.db) {
	if(!err) {
	console.log("We are connected");
	}
	function getBullpens() {
		for (var i=0; i< teamCodes.length; i++) {
			var teamCode = teamCodes[i];
			console.log(teamCode);
			getBullpen(teamCode);
		}

		function getBullpen(teamCode) {
			var url = "http://oakland.athletics.mlb.com/team/depth_chart/index.jsp?c_id=" + teamCode;
			request(url, function(error, response, html) {
				if (!error) {
					var $ = cheerio.load(html);
					var pitcherLIs =  $('#pos_P ul').children().slice(1);
					var pitcherIDs = [];
					pitcherLIs.each(function(i, e) {
						var childLink = $(this).children('a');
						pitcherIDs.push(childLink.attr("href").slice(-6));
					});
					db.collection('currentBullpen').update({team: teamCode}, {team: teamCode, pitchers: pitcherIDs}, function(err, result) {
						if (err) throw err;
						console.log(result);
					});
				} else {
					throw error;
				}
			});
		}
	}

	function getGames(date) {
		
	}
)};

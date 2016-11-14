/**
This Google Script is originally created by @air_hadoken as part of https://botwiki.org/bot-workshops/botmaking-from-the-ground-up/

It uses TwitterLib from https://github.com/airhadoken/twitter-lib -- If you don't already have this library included yet in your project,
please go to Resources -> Libraries and search for MKvHYYdYA4G5JJHj7hxIcoh8V4oX7X1M_

Hello dear workshop participant!

This script contains all the code needed to make a "search & transform" bot.  For an idea of what 
kind of bot you can create with this template, look at https://xkcd.com/1689/ and then look at
https://twitter.com/friendycat

Yes, I sometimes automate the punchline of XKCD comics.

A fair warning before we begin, there will be a modest amount of JavaScript values that you will
have to write to get this bot set up.  I've tried to document this as much as possible, 
*/


/*
The first thing we need to do is set up your API keys and tokens.  These values should look familiar
from the first unit of the workshop.  They come from https://apps.twitter.com/ when you create an app
for your bot account and generate a "read & write" access token.  Copy the values of these keys
and paste them between the quote marks.
*/
  var TWITTER_CONSUMER_KEY     = "";
  
  var TWITTER_CONSUMER_SECRET  = "";
  
  var TWITTER_ACCESS_TOKEN     = "";
  
  var TWITTER_ACCESS_SECRET    = "";

/**
Then we'll need to figure out a few things:
* What you want to search for...
* What you *don't* want to search for...
* And how you want to transform it!

The first thing will be in the form of a Twitter search query. In general, this works just
like the search box in Twitter.  You can search with quoted strings, AND and OR, grouping 
with parentheses, and use special tags like "lang:" and "filter:"  For a more complete
overview of what you can plug into the search API, see https://dev.twitter.com/rest/public/search

This bot script will search Twitter and return up to ten Tweets that match the search.
Every time it runs, it makes a note of the ID of the most recent Tweet; the next time it runs,
it tells Twitter to only return search results after the most recent.  This way, duplicates
are avoided.
*/
var SEARCH_QUERY = '"my boss" filter:safe';

/*
Now we'll set up some basic filters.  This is for finding anything you *don't* want to 
tweet, such as phrases that come up too often or are offensive.  It's optional; you can
leave this value as null and it won't filter out anything.

If this value isn't null, it's required to be a "regular expression" or "regex" for short.
Regexes are delimited by slashes instead of quotes, so they look like /foo/.

If you need a sandbox to try out your regex while working on it, http://regexr.com/ is a good
choice.
*/
var BAD_REGEX = null;

/*
Finally, for the reason why we're botting like this in the first place.  We're going to take
the text of the tweet and transform it by finding a particular portion of the original tweet 
and replacing it with another string.  The "from" part of this usually matches the search query,
but Twitter might match your query to a hashtag or have different spacing than you expect, so 
you might need to play around with it to get the expected results.

REPLACEMENT_FROM here can be a string or a regex.  If it's a regex, you can replace *all* of
the matches with the REPLACEMENT_TO string instead of just the first one by putting the letter
'g' after your regex, and match capital letters to lowercase ones with 'i'.  So:

REPLACEMENT_FROM = /foo/gi;
REPLACEMENT_TO = "bar";

...yields this kind of replacement:
"Football foolery" => "bartball barlery";

with different flags, you'd get these instead:
REPLACEMENT_FROM = /foo/g; // not case-insensitive
"Football foolery" => "Football barlery";

REPLACEMENT_FROM = /foo/i; // not global, only replaces first case-insensitive match
"Football foolery" => "bartball foolery";
*/
var REPLACEMENT_FROM = /boss/gi;
var REPLACEMENT_TO = "cat";

/*
Once you're to this point and all the fields above are filled in, you're ready to start running
the bot!  The next part of this script is four functions that will help you get started:

setupInitialProperties() -- loads the key and access token into the Script Properties object so it can be used later
start() -- sets up the timed trigger to run the bot automatically
doWorkflow() -- runs one iteration of the bot; search, transform, and tweet.
searchTweets() -- does the search and transform part of the bot; also logs the candidate tweets.

Each one of these functions can be run separately, but they also work together to make the bot
run.
*/

/*
Here is a function that you should run from the Run menu above as soon as you have set up your
keys and access tokens above.  Doing so will let you run searchTweets() by itself, allowing
you to see what your bot will tweet before it sends anything to Twitter.
*/
function setupInitialProperties() {
  var scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty("TWITTER_CONSUMER_KEY",    TWITTER_CONSUMER_KEY);
  scriptProperties.setProperty("TWITTER_CONSUMER_SECRET", TWITTER_CONSUMER_SECRET);
  scriptProperties.setProperty("TWITTER_ACCESS_TOKEN",    TWITTER_ACCESS_TOKEN);
  scriptProperties.setProperty("TWITTER_ACCESS_SECRET",   TWITTER_ACCESS_SECRET);
  scriptProperties.setProperty("MAX_TWITTER_ID",          0);
}


/**
The start() function is used to start your Twitter bot's automated, time-based running.
There isn't an associated stop() function since these bots could feasibly run as long
as the API is supported.  However, if you want to stop your bot from automated posting, 
select "Current project's triggers" from the Resources menu above and delete all of the
entries in the dialog that pops up.
*/
function start() {
  
  // The first thing we'll do is make sure the properties are set up for the script.
  setupInitialProperties();
  
  // Then delete the old timed triggers, if they had been set before.
  var triggers = ScriptApp.getProjectTriggers();
  
  for(var i=0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Finally, set up a new timed trigger.
  ScriptApp.newTrigger("doWorkflow")
           .timeBased()
           .everyHours(1) // here's a line you might want to edit, but not every value is valid.  You can try .everyMinutes(5) or .everyHour(1), for example.
           .create();
  // and do one now.
  doWorkflow();
}

/*
After you've run setupInitialProperties(), you can run this function from the Run menu
to search and tweet just one Tweet.  This happens independently of the timed running
if you've already run start().
*/
function doWorkflow() {

  var props = PropertiesService.getScriptProperties();
  var twit = new Twitterlib.OAuth(props);
  var i = -1;
  var tweets = searchTweets(twit);
  
  if(tweets) {
    for(i = tweets.length - 1; i >= 0; i--) {
      if(sendTweet(tweets[i].id_str, tweets[i].text, twit)) {
        ScriptProperties.setProperty("MAX_TWITTER_ID", tweets[0].id_str);
        break;
      }
    }
  }
  if(i < 0) {
    Logger.log("No matching tweets this go-round");
  }
}

/*
  This function does the searching and replacing part of the bot, but does not
  do the tweeting.  You can run this from the Run menu after having run 
  setupInitialProperties(), and read the logs afterward by selecting Logs from
  the View menu.  The logs will contain all of the tweets that were successfully
  transformed by your values for REPLACEMENT_FROM and REPLACEMENT_TO. If there
  were no successful transformations, you will be notified of that in the logs instead.
*/
function searchTweets(twit) {
  
  if(!twit) {
   var props = PropertiesService.getScriptProperties();
   twit = new Twitterlib.OAuth(props); 
  }
  
  var tweets = twit.fetchTweets(
    SEARCH_QUERY,
    function(tweet) {
      var question = decodeTweet(tweet.text);
      var answer   = question.replace(REPLACEMENT_FROM, REPLACEMENT_TO);
          
      if(question !== answer 
         && answer.length < 140
         && !tweet.possibly_sensitive
         && (!BAD_REGEX || !BAD_REGEX.test(answer))
         && !isTweetADupe(answer)) {
        addToCache(answer);
        answer = answer.replace(/@/g, "."); //remove @-mentions. You should almost never @-mention people with bots. It's annoying and it *will* get your bot banned.
        answer = answer.replace(/#/g, ""); //remove hashtags as well to avoid spamming a trending hashtag
        return { id_str: tweet.id_str, text: answer };
      }
    }, 
    { 
      count: 10, 
      since_id: PropertiesService.getScriptProperties().getProperty("MAX_TWITTER_ID"),
      multi: true
    }
  );

  if(tweets && tweets.length > 0) {
    Logger.log("Tweets with successful replacement:");
    tweets.forEach(function(t) {
      Logger.log(t.text);
    });
  } else {
    Logger.log("There were no tweets with successful replacement.");    
  }
  
  return tweets;
}

/*
------------------------------------------------------------------------------
Below this line are library and support functions that you will not need to 
edit.  Focus your attention on the functions above this line for best results.
------------------------------------------------------------------------------
*/
function isTweetADupe(tweetText) {
  var last100 = getCache();
  return !!~last100.indexOf(tweetText); // '!!~' means: -1 = false, anything else = true
}

function getCache() {
  var cache = CacheService.getScriptCache()
  , last100 = cache.get("last100");
  
  if(!last100) {
    last100 = "[]";
    cache.put("last100", last100, 3600);
  }
  return JSON.parse(last100);
}

function addToCache(tweet) {
  var last100 = getCache();
  last100.push(tweet);
  while(last100.length > 100) {
    last100.shift(); 
  }
  CacheService.getScriptCache().put("last100", JSON.stringify(last100), 3600);
}

function sendTweet(reply_id, tweet, twit) {
  if(!twit.sendTweet(tweet)) {
    ScriptProperties.setProperty("MAX_TWITTER_ID", reply_id); // avoid dupes, even if there's a failure
    return false;
  }
  return true;
}

function decodeTweet(tweet) {
  return (tweet.text || tweet).replace(/&(gt|lt|amp);/g, function(str, code) { 
    var lookup = {
      gt: ">",
      lt: "<",
      amp: "&"
    }
    return lookup[code];
  });
}

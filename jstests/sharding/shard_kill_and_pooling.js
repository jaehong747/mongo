//
// Tests what happens when a shard goes down with pooled connections.
//

// Run through the same test twice, once with a hard -9 kill, once with a regular shutdown

for ( var test = 0; test < 2; test++ ) {

var killWith = (test == 0 ? 15 : 9);
var options = { separateConfig : true };

var st = new ShardingTest({shards : 2, mongos : 1, other : options});

// Stop balancer to eliminate weird conn stuff
st.stopBalancer();

var mongos = st.s0;
var coll = mongos.getCollection("foo.bar");

coll.insert({ hello : "world" })
assert.eq( null, coll.getDB().getLastError() );

jsTest.log("Creating new connections...");

// Create a bunch of connections to the primary node through mongos.
// jstest ->(x10)-> mongos ->(x10)-> primary
var conns = [];
for ( var i = 0; i < 50; i++) {
    conns.push(new Mongo(mongos.host));
    assert.neq( null, conns[i].getCollection(coll + "").findOne() );
}

jsTest.log("Returning the connections back to the pool.");

for ( var i = 0; i < conns.length; i++ ) {
    conns[i] = null;
}
// Make sure we return connections back to the pool
gc();

// Don't make test fragile by linking to format of shardConnPoolStats, but this is useful if
// something goes wrong.
var connPoolStats = mongos.getDB("admin").runCommand({ shardConnPoolStats : 1 });
printjson( connPoolStats );

jsTest.log("Shutdown shard " + (killWith == 9 ? "uncleanly" : "" ) + "...");

MongoRunner.stopMongod( st.shard0, killWith );

jsTest.log("Restart shard...");

st.shard0 = MongoRunner.runMongod({ restart : st.shard0 });

jsTest.log("Waiting for socket timeout time...");

// Need to wait longer than the socket polling time.
sleep(2 * 5000);

jsTest.log("Run queries using new connections.");

var numErrors = 0;
for ( var i = 0; i < conns.length; i++) {
    var newConn = new Mongo(mongos.host);
    try {
        assert.neq( null, newConn.getCollection("foo.bar").findOne() );
    } catch (e) {
        printjson(e);
        numErrors++;
    }
}

assert.eq(0, numErrors);

st.stop();

jsTest.log("DONE test " + test);

} // End test loop

jsTest.log("DONE!");
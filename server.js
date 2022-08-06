const express = require("express");
const path = require("path");
let app = express();
let server = app.listen(process.env.PORT || 3000, function () {
    console.info("Listening on port 3000");
});

const io = require("socket.io")(server, {
    allowEIO3: true // false by default
});
app.use(express.static(path.join(__dirname, "")));
let userConnections = [];
io.on("connection", (socket) => {
    console.log("socket id is ", socket.id);
    socket.on("userconnect", data => {
        console.log("userconnect", data.displayName, data.meetingid);
        let other_users = userConnections.filter(p => p.meeting_id == data.meetingid);
        userConnections.push({
            connectionId: socket.id,
            user_id: data.displayName,
            meeting_id: data.meetingid
        });

        other_users.forEach(v => {
            socket.to(v.connectionId).emit("inform_others_about_me", {
                other_user_id: data.displayName,
                connId: socket.id
            });
        });

        socket.emit("inform_me_about_other_user", other_users);
    });

    socket.on("SDPProcess", data => {
        socket.to(data.to_connid).emit("SDPProcess", {
            message: data.message,
            from_connid: socket.id
        });
    });

    socket.on("disconnect", function () {
        console.log("Disconnected");
        let disUser = userConnections.find(p => p.connectionId == socket.id);
        if (disUser) {
            let meetingid = disUser.meeting_id;
            userConnections = userConnections.filter(p => p.connectionId != socket.id);
            let list = userConnections.filter(p => p.meeting_id == meetingid);
            list.forEach(v => {
                socket.to(v.connectionId).emit("inform_other_about_disconnected_user", {
                    connId: socket.id
                });
            });
        }
    });

});

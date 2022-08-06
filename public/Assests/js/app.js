const AppProcess = (function () {
    const peers_connection_ids = [];
    const peers_connection = [];
    const remote_vid_stream = [];
    const remote_aud_stream = [];
    let local_div;
    let serverProcess;
    let audio;
    let isAudioMute = true;
    const rtp_audio_senders = [];
    let video_states = {
        None: 0,
        Camera: 1,
        ScreenShare: 2
    };
    let video_st = video_states.None;
    let videoCamTrack;
    const rtp_vid_senders = [];
    let my_connection_id;
    async function _init(SDP_function, my_connid) {
        serverProcess = SDP_function;
        my_connection_id = my_connid;
        eventProcess();
        local_div = document.getElementById("localVideoPlayer");
    }

    function eventProcess() {
        $("#miceMuteUnmute").on("click", async function () {
            if (!audio) {
                await loadAudio();
            }
            if (!audio) {
                alert("Audio permission has not granted");
                return;
            }
            if (isAudioMute) {
                audio.enable = true;
                $(this).html("<span class='material-icons' style='width: 100%;'>mic</span>");
                updateMediaSenders(audio, rtp_audio_senders);
            } else {
                audio.enabled = false;
                $(this).html("<span class='material-icons' style='width: 100%;'>mic_off</span>");
                removeMediaSenders(rtp_audio_senders);
            }
            isAudioMute = !isAudioMute;
        });

        $("#videoCamOnOff").on("click", async function () {
            if (video_st == video_states.Camera) {
                await videoProcess(video_states.None);
            } else {
                await videoProcess(video_states.Camera);
            }
        });

        $("#ScreenShareOnOff").on("click", async function () {
            if (video_st == video_states.ScreenShare) {
                await videoProcess(video_states.None);
            } else {
                await videoProcess(video_states.ScreenShare);
            }
        });
    }

    async function loadAudio() {
        try {
            let astream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            audio = astream.getAudioTracks()[0];
            audio.enabled = false;
        } catch (e) {
            console.log(e);

        }
    }

    function connection_status(connection) {
        return !!(connection && (connection.connectionState == "new"
            || connection.connectionState == "connecting"
            || connection.connectionState == "connected"));
    }

    async function updateMediaSenders(track, rtp_senders) {
        for (let con_id in peers_connection_ids) {
            if (connection_status(peers_connection[con_id])) {
                if (rtp_senders[con_id] && rtp_senders[con_id].track) {
                    rtp_senders[con_id].replaceTrack(track);
                } else {
                    rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
                }
            }
        }
    }

    function removeMediaSenders(rtp_senders) {
        for (let con_id in peers_connection_ids) {
            if (rtp_senders[con_id] && connection_status(peers_connection[con_id])) {
                peers_connection[con_id].removeTrack(rtp_senders[con_id]);
                rtp_senders[con_id] = null;
            }
        }
    }

    function removeVideoStream(rtp_vid_senders) {
        if (videoCamTrack) {
            videoCamTrack.stop();
            videoCamTrack = null;
            local_div.srcObject = null;
            removeMediaSenders(rtp_vid_senders);
        }
    }

    async function videoProcess(newVideoState) {
        if (newVideoState == video_states.None) {
            $("#videoCamOnOff").html("<span class='material-icons' style='width: 100%;'>videocam_off</span>");
            $("#ScreenShareOnOff").html('<span class="material-icons">present_to_all</span><div>Present Now</div>');
            video_st = newVideoState;

            removeVideoStream(rtp_vid_senders);
            return;
        }
        if (newVideoState == video_states.Camera) {
            $("#videoCamOnOff").html("<span class='material-icons' style='width: 100%;'>videocam_on</span>");
        }
        try {
            let vstream = null;
            if (newVideoState == video_states.Camera) {
                vstream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                });
            } else if (newVideoState == video_states.ScreenShare) {
                vstream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                });
                vstream.oninactive = e => {
                    removeVideoStream(rtp_vid_senders);
                    $("#ScreenShareOnOff").html('<span class="material-icons">present_to_all</span><div>Present Now</div>');
                };
            }
            if (vstream && vstream.getVideoTracks().length > 0) {
                videoCamTrack = vstream.getVideoTracks()[0];
                if (videoCamTrack) {
                    local_div.srcObject = new MediaStream([videoCamTrack]);
                    updateMediaSenders(videoCamTrack, rtp_vid_senders);
                }
            }
        } catch (e) {
            console.log(e);
            return;
        }
        video_st = newVideoState;
        if (newVideoState == video_states.Camera) {
            $("#videoCamOnOff").html('<span class="material-icons" style="width: 100%;">videocam</span>');
            $("#ScreenShareOnOff").html('<span class="material-icons">present_to_all</span><div>Present Now</div>');
        } else if (newVideoState == video_states.ScreenShare) {
            $("#videoCamOnOff").html('<span class="material-icons" style="width: 100%;">videocam_off</span>');
            $("#ScreenShareOnOff").html('<span class="material-icons text-success">present_to_all</span><div class="text-success">Stop Present Now</div>');
        }
    }

    let iceConfiguration = {
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302"
            },
            {
                urls: "stun:stun1.l.google.com:19302"
            }
        ]
    }

    async function setConnection(connid) {
        let connection = new RTCPeerConnection(iceConfiguration);

        connection.onnegotiationneeded = async function () {
            await setOffer(connid);
        }
        connection.onicecandidate = function (event) {
            if (event.candidate) {
                serverProcess(
                    JSON.stringify({
                        icecandidate: event.candidate
                    }),
                    connid
                );
            }
        }
        connection.ontrack = function (event) {
            if (!remote_vid_stream[connid]) {
                remote_vid_stream[connid] = new MediaStream();
            }
            if (!remote_aud_stream[connid]) {
                remote_aud_stream[connid] = new MediaStream();
            }

            if (event.track.kind == "video") {
                remote_vid_stream[connid]
                    .getVideoTracks()
                    .forEach(t => remote_vid_stream[connid].removeTrack(t));
                remote_vid_stream[connid].addTrack(event.track);
                let remoteVideoPlayer = document.getElementById("v_" + connid);
                remoteVideoPlayer.srcObject = null;
                remoteVideoPlayer.srcObject = remote_vid_stream[connid];
                remoteVideoPlayer.load();
            } else if (event.track.kind == "audio") {
                remote_aud_stream[connid]
                    .getAudioTracks()
                    .forEach(t => remote_aud_stream[connid].removeTrack(t));
                remote_aud_stream[connid].addTrack(event.track);
                let remoteAudioPlayer = document.getElementById("a_" + connid);
                remoteAudioPlayer.srcObject = null;
                remoteAudioPlayer.srcObject = remote_aud_stream[connid];
                remoteAudioPlayer.load();
            }
        };
        peers_connection_ids[connid] = connid;
        peers_connection[connid] = connection;

        if (
            video_st == video_states.Camera ||
            video_st == video_states.ScreenShare
        ) {
            if (videoCamTrack) {
                updateMediaSenders(videoCamTrack, rtp_vid_senders);
            }
        }

        return connection;
    }

    async function setOffer(connid) {
        let connection = peers_connection[connid];
        let offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        serverProcess(
            JSON.stringify({
                offer: connection.localDescription
            }),
            connid
        );
    }

    async function SDPProcess(message, from_connid) {
        message = JSON.parse(message);
        if (message.answer) {
            await peers_connection[from_connid].setRemoteDescription(
                new RTCSessionDescription(message.answer));
        } else if (message.offer) {
            if (!peers_connection[from_connid]) {
                await setConnection(from_connid);
            }
            await peers_connection[from_connid].setRemoteDescription(
                new RTCSessionDescription(message.offer));
            let answer = await peers_connection[from_connid].createAnswer();
            await peers_connection[from_connid].setLocalDescription(answer);
            serverProcess(
                JSON.stringify({
                    answer: answer
                }),
                from_connid
            );
        } else if (message.icecandidate) {
            if (!peers_connection[from_connid]) {
                await setConnection(from_connid);
            }
            try {
                await peers_connection[from_connid].addIceCandidate(message.icecandidate);
            } catch (e) {
                console.log(e);
            }
        }
    }

    async function closeConnection(connId) {
        peers_connection_ids[connId] = null;
        if (peers_connection[connId]) {
            peers_connection[connId].close();
            peers_connection[connId] = null;
        }
        if (remote_aud_stream[connId]) {
            remote_aud_stream[connId].getTracks().forEach(t => {
                if (t.stop) t.stop();
            });
            remote_aud_stream[connId] = null;
        }
        if (remote_vid_stream[connId]) {
            remote_vid_stream[connId].getTracks().forEach(t => {
                if (t.stop) t.stop();
            });
            remote_vid_stream[connId] = null;
        }
    }

    return {
        setNewConnection: async function (connid) {
            await setConnection(connid);
        },
        init: async function (SDP_function, my_connid) {
            await _init(SDP_function, my_connid);
        },
        processClientFunc: async function (data, from_connid) {
            await SDPProcess(data, from_connid);
        },
        closeConnectionCall: async function (connId) {
            await this.closeConnection(connId);
        }
    }
})();

const MyApp = (function () {
    let socket = null;
    let user_id = "";
    let meeting_id = "";
    function init(uid, mid) {
        user_id = uid;
        meeting_id = mid;
        $("#meetingContainer").show();
        $("#me h2").text(user_id + "(Me)");
        document.title = user_id;
        event_process_for_signaling_server();
    }

    function event_process_for_signaling_server() {
        socket = io.connect();

        let SDP_function = function (data, to_connid) {
            socket.emit("SDPProcess", {
                message: data,
                to_connid: to_connid
            })
        }
        socket.on("connect", () => {
            if (socket.connected) {
                AppProcess.init(SDP_function, socket.id);
                if (user_id != "" && meeting_id != "") {
                    socket.emit("userconnect", {
                        displayName: user_id,
                        meetingid: meeting_id
                    })
                }
            }
        });

        socket.on("inform_other_about_disconnected_user", function (data) {
            $("#" + data.connId).remove();
            AppProcess.closeConnectionCall(data.connId);
        });

        socket.on("inform_others_about_me", function (data) {
            addUser(data.other_user_id, data.connId);
            AppProcess.setNewConnection(data.connId);
        });

        socket.on("inform_me_about_other_user", function (other_users) {
            if (other_users) {
                other_users.forEach(u => {
                    addUser(u.user_id, u.connectionId);
                    AppProcess.setNewConnection(u.connectionId);
                });
            }
        });

        socket.on("SDPProcess", async function (data) {
            await AppProcess.processClientFunc(data.message, data.from_connid);
        });
    }

    function addUser(other_user_id, connId) {
        let newDivId = $("#otherTemplate").clone();
        newDivId = newDivId.attr("id", connId).addClass("other");
        newDivId.find("h2").text(other_user_id);
        newDivId.find("video").attr("id", "v_" + connId);
        newDivId.find("audio").attr("id", "a_" + connId);
        newDivId.show();
        $("#divUsers").append(newDivId);
    }

    return {
        _init: function (uid, mid) {
            init(uid, mid);
        },
    };
})();
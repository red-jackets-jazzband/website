---
title: "Red Jackets Jazzband"
tagline: "Agenda"
date: 2019-03-16T08:20:22+01:00
---

<script type="text/javascript">
function readFile(file, callback)
{
    var f = new XMLHttpRequest();
    f.open("GET", file, false);
    f.onreadystatechange = function ()
    {
        if(f.readyState === 4)
        {
            if(f.status === 200 || f.status == 0)
            {
                var res= f.responseText;
                callback(res);
            }
        }
    }
    f.send(null);
}

function parse_showlist(data) {
    var shows = data.split('\n');
    var number_of_shows = shows.length - 1;

    var upcoming_table = document.getElementById("upcomingShowTable");
    var past_table = document.getElementById("pastShowTable");

    var now = new Date()

    for (var i = 0; i < number_of_shows; i++) {
        var show_date_text = shows[i].split(",")[0];
        var show_date = new Date( Date.parse(show_date_text.split("-")[0]));

        if( show_date > now ) {
            var table = upcoming_table;
        } else {
            var table = past_table;
        } 

        var show_name = shows[i].split(",")[1];
        var show_loc = shows[i].split(",")[2];

        var row = table.insertRow(-1);
        var cell = row.insertCell(-1);
	cell.innerHTML = show_date.getDate() + "/" + show_date.getMonth() + "/" + show_date.getFullYear()
    cell.style.fontWeight = "bold";
    cell.style.paddingRight = "5px";
        var cell = row.insertCell(-1);
        cell.innerHTML = show_name
	cell.style.fontWeight = "bold";
        var row = table.insertRow(-1);
        row.insertCell(-1);
        var cell = row.insertCell(-1);
        cell.innerHTML = show_loc
    }
}

function loadShows() {
    readFile('shows.txt', parse_showlist) 
}

window[ addEventListener ? 'addEventListener' : 'attachEvent' ]( addEventListener ? 'load' : 'onload', loadShows )

</script>
<table id="upcomingShowTable">
<table id="pastShowTable">
</table> 


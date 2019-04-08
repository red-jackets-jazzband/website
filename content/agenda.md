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

    var table = document.getElementById("showTable");

    for (var i = 0; i < number_of_shows; i++) {
        var show_date = shows[i].split(",")[0];
        var show_name = shows[i].split(",")[1];
        var show_loc = shows[i].split(",")[2];

        var row = table.insertRow(-1);
        var cell = row.insertCell(-1);
	cell.innerHTML = show_date
	cell.style.fontWeight = "bold";
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

<table id="showTable" style="width:100%;">
</table> 


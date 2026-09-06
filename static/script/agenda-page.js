// Entry point for /agenda/: fills #showTable from static/agenda/shows.txt.
import { byId } from "./lib/dom.js";
import { parseShowList, formatShowDate, isUpcoming } from "./lib/showlist.js";

function renderShow(table, show) {
  const upcoming = isUpcoming(show);

  const topRow = table.insertRow(-1);
  if (upcoming) topRow.classList.add("upcomingShow");
  const dateCell = topRow.insertCell(-1);
  dateCell.textContent = formatShowDate(show);
  dateCell.classList.add("dateCell");
  const nameCell = topRow.insertCell(-1);
  nameCell.textContent = show.name;
  nameCell.classList.add("nameCell");

  const bottomRow = table.insertRow(-1);
  if (upcoming) bottomRow.classList.add("upcomingShow");
  bottomRow.insertCell(-1);
  bottomRow.insertCell(-1).textContent = show.location;
}

async function loadShows() {
  const table = byId("showTable");
  if (!table) return;
  try {
    const response = await fetch("shows.txt");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    parseShowList(await response.text()).forEach((show) => renderShow(table, show));
  } catch (err) {
    console.warn("Could not load the show list:", err);
  }
}

window.addEventListener("load", loadShows);

/*
  Fetch a static asset (ABC file, setlist .txt, index manifest) as text.

  Kept as XHR rather than fetch() so a `file://` open of the built site still
  works: XHR reports status 0 for a successful local-file read, which we treat
  as OK. `onError`, when given, is called with the HTTP status for a genuine
  failure (e.g. a setlist referencing an .abc that no longer exists).
*/
export function readFile(path, onLoad, onError) {
  const request = new XMLHttpRequest();
  request.onreadystatechange = () => {
    if (request.readyState !== 4) return;
    if (request.status === 200 || request.status === 0) {
      onLoad(request.responseText);
    } else if (onError) {
      onError(request.status);
    }
  };
  request.open("GET", path, true);
  request.send(null);
}

/* eslint-disable react/prop-types */
const paths = {
  "gift": "M7 18h34v9H7z M10 27v14h28V27M24 18v23M24 18H16a5 5 0 1 1 5-7l3 7Zm0 0h8a5 5 0 1 0-5-7l-3 7Z",
  "grid": "M6 6h14v14H6z M28 6h14v14H28z M6 28h14v14H6z M35 27v16M27 35h16",
  "box": "m7 15 17-8 17 8-17 8-17-8Zm0 0v19l17 8 17-8V15M24 23v19M15 11l18 8",
  "repeat": "M7 16a18 18 0 0 1 31-5l4 5M42 6v10H32M41 32A18 18 0 0 1 10 37l-4-5M6 42V32h10 M17 20l7-4 7 4v9l-7 4-7-4v-9Zm0 0 7 4 7-4M24 24v9",
  "heart": "M24 41 7 24C-5 9 15 0 24 14 33 0 53 9 41 24Z",
  "star": "m24 4 6 13 14 2-10 10 3 15-13-7-13 7 3-15L4 19l14-2Z"
};
export default function AppearanceIcon({ name }) {
 return paths[name] ? <svg aria-hidden="true" viewBox="0 0 48 48" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg> : null;
}

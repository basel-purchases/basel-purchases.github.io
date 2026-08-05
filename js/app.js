const startButton = document.getElementById("startButton");
const result = document.getElementById("result");

startButton.addEventListener("click", () => {
  const currentTime = new Date().toLocaleTimeString("ar");

  result.textContent =
    `النظام يعمل بنجاح ✅ وقت الاختبار: ${currentTime}`;
});
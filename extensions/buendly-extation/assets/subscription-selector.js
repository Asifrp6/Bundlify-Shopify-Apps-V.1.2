document.addEventListener("DOMContentLoaded", async () => {
  const wrapper = document.querySelector(".subscription-wrapper");

  if (!wrapper) return;

  const productId = wrapper.dataset.productId;

  const cards = document.querySelectorAll(".purchase-card");

  const frequencyContainer = document.querySelector("#frequency-container");

  const planList = document.querySelector("#frequency-container");
  console.log("Bundlify subscription JS loaded");

  /*
--------------------------------
ONE TIME / SUBSCRIPTION SWITCH
--------------------------------
*/

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((item) => {
        item.classList.remove("active");
      });

      card.classList.add("active");

      if (card.dataset.type === "subscription") {
        frequencyContainer.style.display = "block";
      } else {
        frequencyContainer.style.display = "none";

        removeSellingPlan();
      }
    });
  });

  /*
--------------------------------
LOAD SUBSCRIPTION PLANS
FROM YOUR API
--------------------------------
*/

  try {
    const response = await fetch(`/apps/bundlify?productId=${productId}`);

    const data = await response.json();

    console.log("Subscription Plans:", data);

    if (!data.success || !data.plans) {
      planList.innerHTML = "No subscription plans found";

      return;
    }

    renderPlans(data.plans);
  } catch (error) {
    console.error("Plan loading error:", error);
  }

  /*
--------------------------------
RENDER PLANS
--------------------------------
*/

  function renderPlans(plans) {
    planList.innerHTML = "";

    plans.forEach((plan, index) => {
      const div = document.createElement("div");

      div.className = "frequency";

      if (index === 0) {
        div.classList.add("selected");
      }

      div.dataset.sellingPlanId = plan.sellingPlanId;

      div.innerHTML = `

<div>

<input 
type="radio"
${index === 0 ? "checked" : ""}
/>

<strong>
${plan.name}
</strong>

${plan.discountValue ? `(${plan.discountValue}% off)` : ""}

</div>


<div>

${calculatePrice(plan)}

 / delivery

</div>

`;

      div.onclick = () => {
        document.querySelectorAll(".frequency").forEach((item) => {
          item.classList.remove("selected");
        });

        div.classList.add("selected");

        setSellingPlan(plan.sellingPlanId);
      };

      planList.appendChild(div);
    });

    /*
Set first plan
*/

    if (plans[0]) {
      setSellingPlan(plans[0].sellingPlanId);
    }
  }

  /*
--------------------------------
ADD SELLING PLAN TO CART
--------------------------------
*/

  function setSellingPlan(id) {
    const form = document.querySelector('form[action="/cart/add"]');

    if (!form) return;

    let input = form.querySelector('input[name="selling_plan"]');

    if (!input) {
      input = document.createElement("input");

      input.type = "hidden";

      input.name = "selling_plan";

      form.appendChild(input);
    }

    input.value = id;

    console.log("Selling Plan Selected:", id);
  }

  function removeSellingPlan() {
    const input = document.querySelector('input[name="selling_plan"]');

    if (input) {
      input.remove();
    }
  }

  function calculatePrice(plan) {
    const price = Number(wrapper.dataset.price) / 100;

    if (plan.discountType === "percentage") {
      return "$" + (price - (price * plan.discountValue) / 100).toFixed(2);
    }

    return "$" + price.toFixed(2);
  }
});

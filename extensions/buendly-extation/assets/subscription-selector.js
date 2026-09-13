console.log("Bundlify subscription JS loaded");

document.addEventListener("DOMContentLoaded", async () => {
  const wrapper = document.querySelector(".bundlify-subscription-widget");

  if (!wrapper) {
    console.log("Bundlify wrapper not found");

    return;
  }

  const productId = wrapper.dataset.productId;

  const frequencyContainer = document.querySelector("#frequency-container");

  if (!frequencyContainer) {
    console.log("Frequency container missing");

    return;
  }

  /*
  -------------------------------
  LOAD SUBSCRIPTION PLANS
  -------------------------------
  */

  try {
    const response = await fetch(`/apps/bundlify?productId=${productId}`);

    const data = await response.json();

    console.log("Subscription Plans:", data);

    if (!data.success || !data.plans?.length) {
      frequencyContainer.innerHTML = "No subscription plans found";

      return;
    }

    renderPlans(data.plans);
  } catch (error) {
    console.error("Plan loading error:", error);
  }

  /*
  -------------------------------
  RENDER PLANS
  -------------------------------
  */

  function renderPlans(plans) {
    frequencyContainer.innerHTML = "";

    plans.forEach((plan, index) => {
      const div = document.createElement("div");

      div.className = "frequency";

      if (index === 0) {
        div.classList.add("selected");
      }

      div.innerHTML = `

          <label>

            <input

              type="radio"

              name="bundlify_plan"

              value="${plan.sellingPlanId}"

              ${index === 0 ? "checked" : ""}

            >


            <span>

              <strong>
                ${plan.name}
              </strong>


              ${
                plan.discountValue
                  ? `<small>
                Save ${plan.discountValue}%
                </small>`
                  : ""
              }


            </span>


            <span>

              ${calculatePrice(plan)}

              / delivery

            </span>


          </label>


        `;

      div.addEventListener("click", () => {
        document.querySelectorAll(".frequency").forEach((item) => {
          item.classList.remove("selected");
        });

        div.classList.add("selected");

        setSellingPlan(plan.sellingPlanId);
      });

      frequencyContainer.appendChild(div);
    });

    // select first plan automatically

    if (plans[0]) {
      setSellingPlan(plans[0].sellingPlanId);
    }
  }

  /*
  -------------------------------
  ADD SELLING PLAN TO SHOPIFY FORM
  -------------------------------
  */

  function setSellingPlan(id) {
    const form = document.querySelector('form[action*="/cart/add"]');

    if (!form) {
      console.log("Shopify product form not found");

      return;
    }

    let input = form.querySelector('input[name="selling_plan"]');

    if (!input) {
      input = document.createElement("input");

      input.type = "hidden";

      input.name = "selling_plan";

      form.appendChild(input);
    }

    input.value = id;

    input.disabled = false;

    console.log("Selling plan added:", id);
  }

  /*
  -------------------------------
  REMOVE SELLING PLAN
  -------------------------------
  */

  function removeSellingPlan() {
    const input = document.querySelector('input[name="selling_plan"]');

    if (input) {
      input.remove();
    }
  }

  /*
  -------------------------------
  ONE TIME / SUBSCRIPTION SWITCH
  -------------------------------
  */

  const purchaseCards = document.querySelectorAll(".purchase-card");

  purchaseCards.forEach((card) => {
    card.addEventListener("click", () => {
      purchaseCards.forEach((item) => {
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
  -------------------------------
  PRICE CALCULATION DISPLAY ONLY
  -------------------------------
  */

  function calculatePrice(plan) {
    const price = Number(wrapper.dataset.price) / 100;

    if (plan.discountType === "percentage") {
      return "$" + (price - (price * plan.discountValue) / 100).toFixed(2);
    }

    return "$" + price.toFixed(2);
  }
});

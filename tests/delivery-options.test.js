import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../app/services/validation.js";
import { sellingPlanInput, optionRecords } from "../app/services/delivery-options.js";
import { changeSubscription } from "../app/services/subscription-management.server.js";
const options = [{ frequency:"Weekly", discount:20 }, { frequency:"Every 2 weeks", discount:15 }];
test("delivery options validate bounds, duplicates and interval counts", () => {
  const form = new FormData();
  form.set("name","Coffee"); form.set("productId","gid://shopify/Product/1");
  form.set("deliveryOptions",JSON.stringify(options));
  const result=validatePlan(form);
  assert.deepEqual(result.errors,{});
  assert.equal(result.values.deliveryOptions[1].intervalCount,2);
  for (const invalid of [[], [options[0],options[0]], [{frequency:"Daily",discount:""}], [{frequency:"Daily",discount:101}], [{frequency:"Hourly",discount:0}], [{frequency:"Monthly",discount:true}], [{frequency:"Monthly",discount:[]}], [{frequency:"Monthly",discount:[10]}], [{frequency:"toString",discount:0}], [{frequency:"__proto__",discount:0}]]) {
    form.set("deliveryOptions",JSON.stringify(invalid));
    assert.ok(validatePlan(form).errors.deliveryOptions);
  }
});

test("selling plan input rejects inherited schedule properties", () => {
  assert.throws(() => sellingPlanInput("Coffee", {frequency: "toString", discount: 0}), /Invalid/);
});
test("daily and biweekly policies keep billing and delivery aligned", () => {
  for (const frequency of ["Daily","Every 2 weeks"]) {
    const input=sellingPlanInput("Coffee",{frequency,discount:20});
    assert.deepEqual(input.billingPolicy.recurring,input.deliveryPolicy.recurring);
  }
  assert.equal(sellingPlanInput("Coffee",options[1]).billingPolicy.recurring.intervalCount,2);
});
test("option IDs are matched by frequency regardless of response order", () => {
  const records=optionRecords(options,{sellingPlans:{nodes:[{id:"b",options:["Every 2 weeks"]},{id:"a",options:["Weekly"]}]}});
  assert.deepEqual(records.map(o=>o.sellingPlanId),["a","b"]);
});
test("update preserves matching IDs, adds and removes frequencies, scopes local write", async () => {
  let variables, saved;
  const group={id:"group",sellingPlans:{nodes:[{id:"week",options:["Weekly"]},{id:"month",options:["Monthly"]}]}};
  let calls=0;
  const admin={graphql:async (_,args)=>{
    if(calls++===0)return Response.json({data:{sellingPlanGroup:group}});
    variables=args.variables;
    return Response.json({data:{sellingPlanGroupUpdate:{sellingPlanGroup:{id:"group",sellingPlans:{nodes:[{id:"week",options:["Weekly"]},{id:"bi",options:["Every 2 weeks"]}]}},userErrors:[]}}});
  }};
  await changeSubscription({admin,prisma:{subscriptionPlan:{update:async arg=>{saved=arg;}}},plan:{id:1,shop:"test",sellingPlanGroupId:"group"},values:{name:"Coffee",deliveryOptions:options}});
  assert.equal(variables.input.sellingPlansToUpdate[0].id,"week");
  assert.equal(variables.input.sellingPlansToCreate.length,1);
  assert.deepEqual(variables.input.sellingPlansToDelete,["month"]);
  assert.deepEqual(saved.where,{id:1,shop:"test"});
  assert.equal(saved.data.deliveryOptions.create[1].sellingPlanId,"bi");
});
test("Shopify rejection leaves the local record untouched", async () => {
  let calls=0;
  const admin={graphql:async()=>Response.json(calls++===0?{data:{sellingPlanGroup:{id:"group",sellingPlans:{nodes:[]}}}}:{data:{sellingPlanGroupUpdate:{userErrors:[{message:"Denied"}]}}})};
  await assert.rejects(changeSubscription({admin,prisma:{subscriptionPlan:{update:()=>assert.fail("must not write")}},plan:{id:1,shop:"test",sellingPlanGroupId:"group"},values:{name:"Coffee",deliveryOptions:options}}),/Denied/);
});

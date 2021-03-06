import { Component, OnInit, HostListener } from '@angular/core';
import { FormGroup, FormControl, FormBuilder } from '@angular/forms';
import { OrderService } from '../order.service';
import { RecipeService } from '../recipe.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Validators } from '@angular/forms';
import swal from 'sweetalert';
import { User } from 'src/app/models/user';
import { environment } from '../../../environments/environment';
import { PaymentService } from 'src/app/payments/payment.service';
import { AuthService } from 'src/app/core/auth.service';
declare var $: any;

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {

  handler: any;
  amount = 6000;

  recipeList;
  contactForm: FormGroup;
  currentUser: User;
  user;
  orderId;
  privacy = 'publish';
  notLoggedIn;
  extraCharged;

  closedStripe = true;

  formErrors = {
    'barName': '',
    'firstName': '',
    'lastName': '',
    'mobile': '',
    'email': '',
    'address': '',
    'city': '',
    'postalCode': '',
    'deliveryDay': '',
    'deliveryTime': ''
  };

  validationMessages = {
    'barName': {
      'required': 'Bar Name is required'
    },
    'firstName': {
      'required': 'First Name is required',
      'minlength': 'First Name must be at least 2 characters long'
    },
    'lastName': {
      'required': 'Last Name is required',
      'minlength': 'Last Name must be at least 2 characters long'
    },
    'mobile': {
      'required': 'Mobile Number is required',
      'pattern': 'Mobile Number must contain only numbers'
    },
    'email': {
      'required': 'Email is required',
      'email': 'Email not in valid format'
    },
    'address': {
      'required': 'Address is required'
    },
    'city': {
      'required': 'City is required'
    },
    'postalCode': {
      'required': 'Postal Code is required'
    },
    'deliveryDay': {
      'required': 'Delivery Day is required'
    },
    'deliveryTime': {
      'required': 'Delivery Time is required'
    }
  };

  constructor(private orderService: OrderService,
    private recipeService: RecipeService,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private paymentSvc: PaymentService,
    public auth: AuthService) {
    this.extraCharged = false;
    this.auth.user.subscribe(user => {
      if (!user) {
        this.notLoggedIn = true;
        $('#loginModal').modal('show');
      } else {
        this.user = user.uid;
        $('#loginModal').modal('hide');
      }
    });

    this.currentUser = JSON.parse(localStorage.getItem('currentUser'));

    this.contactForm = this.fb.group({
      barName: ['', [Validators.required]],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      mobile: ['', [Validators.required]],
      email: ['', [Validators.required]],
      address: ['', [Validators.required]],
      city: ['', [Validators.required]],
      postalCode: ['', [Validators.required]],
      deliveryDay: ['', [Validators.required]],
      deliveryTime: ['', [Validators.required]],
      notes: ''
    });

    this.contactForm.valueChanges.subscribe(data => { this.onValueChanged(data); });
    this.contactForm.controls['deliveryDay'].valueChanges.subscribe(value => {
      if (value === 'tomorrow') {
        if (this.extraCharged) {
          return;
        }
        this.amount += 2000;
        this.extraCharged = true;
      } else if (value === '3-4days') {
        if (this.extraCharged) {
          this.amount -= 2000;
          this.extraCharged = false;
        }
      }
    });
  }

  onValueChanged(data?: any) {
    if (!this.contactForm) { return; }

    const form = this.contactForm;
    for (const field of Object.keys(this.formErrors)) {
      this.formErrors[field] = '';
      const control = form.get(field);

      if (control && !control.valid) {
        const messages = this.validationMessages[field];

        for (const key of Object.keys(control.errors)) {
          this.formErrors[field] += messages[key] + ' ';
        }
      }
    }
  }

  ngOnInit() {

    this.handler = StripeCheckout.configure({
      key: environment.stripeKey,
      locale: 'auto',
      token: token => {
        this.closedStripe = false;
        this.paymentSvc.processPayment(token, this.amount, this.orderId)
          .subscribe((res: any) => {
            if (+res.statusCode === 400) {
              this.paymentSvc.addPayment(token, this.amount, this.orderId, null, null)
                .then(() => {
                  this.orderService.changePaymentStatus(this.orderId, 'unpaid')
                    .then(() => {
                      console.log('Cannot Charge');
                    });
                })
                .catch(() => {
                  console.log('Error Cannot Charge');
                });
            } else if (res.status === 'succeeded') {
              this.paymentSvc.addPayment(token, this.amount, this.orderId, 'paid', res)
                .then(() => {
                  // console.log('Charged');
                  this.orderService.changePaymentStatus(this.orderId, 'paid')
                    .then(() => {
                      this.router.navigate(['thankyou']);
                    });
                })
                .catch(() => {
                  console.log('Error Charge');
                });
            }
          });
      },
      closed: () => {
        if (this.closedStripe) {
          // Delete Order
          this.orderService.getRecipeId(this.orderId).subscribe((order: any) => {
            this.orderService.deleteOrder(this.orderId)
              .then(() => {
                this.recipeService.deleteRecipe(order.id)
                  .then(() => {
                    console.log('Deleted');
                  })
                  .catch(() => {
                    console.log('Cannot Delete Recipe');
                  });
              });
          });
        }
      }
    });
    this.orderService.currentOrderList.subscribe(list => this.recipeList = list);

    this.route.queryParams.subscribe(params => {
      // console.log(params.barId);
      if (params.barId) {

        this.recipeService.getRecipe(params.barId).subscribe((item) => {
          this.recipeList = Object.assign([], item);
          this.orderService.setRecipeList(this.recipeList);
        });
      } else if (this.recipeList === '') {
        this.router.navigate(['order']);
      }
    });

  }

  handlePayment() {
    this.handler.open({
      name: 'Food App',
      description: 'Deposit Funds',
      amount: this.amount
    });
  }

  @HostListener('window:popstate')
  onpopstate() {
    this.handler.close();
  }

  removeItem(item) {
    this.recipeList = this.recipeList.filter(i => {
      return (i.name !== item.name);
    });
  }

  onRadioSwith(event) {
    this.privacy = event.target.value;
  }
  onBarSwitch(event) {
    if (this.amount === 8000) {
      if (+event.target.value === 30) {
        this.amount = 8000;
      } else {
        this.amount = 14000;
      }
    } else if (this.amount === 14000) {
      if (+event.target.value === 60) {
        this.amount = 14000;
      } else if (+event.target.value === 30) {
        this.amount = 8000;
      }
    } else {
      this.amount = +event.target.value === 30 ? 6000 : 12000;
    }
  }

  /* Create Order and Recipe */
  submitContact() {
    if (!this.contactForm.valid) {
      swal({ title: 'Please fill all the form fields' });
    } else {
      this.recipeList.privacy = this.privacy;
      this.recipeList.barName = this.contactForm.value['barName'];
      this.recipeService.createRecipe(this.recipeList)
        .then((res) => {
          // alert('Placed \nOrder Id:  ' + res.id);
          this.contactForm.addControl('id', new FormControl(res.id));
          this.contactForm.addControl('privacy', new FormControl(this.privacy));
          this.contactForm.addControl('uid', new FormControl(this.currentUser.uid));
          this.contactForm.addControl('status', new FormControl(''));
          this.orderService.addCustomerDetails(this.contactForm.value)
            .then((resp) => {
              this.orderService.setOrderContact(this.contactForm.value);
              this.orderId = resp.id;
              this.handlePayment();

              // console.log(resp.id);
              // this.handlePayment();
              // this.router.navigate(['thankyou']);
            })
            .catch(er => {
              console.log(er);
            });
        })
        .catch(err => {
          console.log(err);
        });
    }
  }

}
